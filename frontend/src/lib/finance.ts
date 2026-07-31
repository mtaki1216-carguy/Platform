import { monthKey, today } from './format'
import type { Expense, Income, Member, Sprint, UUID } from './types'

/**
 * ── 残高の考え方（機能①の定義） ─────────────────────────────────────────
 *
 *  チーム残高（＝チーム口座に今いくらあるか）は「現金が動いたか」で数える:
 *    収入            … 入金日に加算
 *    チーム口座払い  … 支払日に減算
 *    個人立替        … 立替た時点ではチーム口座は動かない。
 *                      精算した日に減算する（＝メンバーへ払い戻した日）
 *
 *  だから未精算の立替は「チーム残高」には出てこない。代わりに
 *  「誰にいくら返すべきか（未精算立替）」として別に持ち、
 *  全部返した後の残高を「精算後見込み残高」として出す。
 *
 *  この関数群がアプリ内で唯一の計算元。画面側で足し算し直さないこと。
 * ────────────────────────────────────────────────────────────────────────
 */

/**
 * ── 固定費（毎月払い）の扱い ─────────────────────────────────────────
 *
 *  固定費は「毎月ぶんの行」を作らず、1件の記録に毎月の支払日を持たせて、
 *  今日までに何回払ったかをここで数える。行を自動生成すると、誰の端末が
 *  いつ生成するかで重複や抜けが起きるため。
 *
 *  支払日が月末に無い日（31日など）の月は、その月の最終日に丸める。
 * ────────────────────────────────────────────────────────────────────────
 */

/**
 * ── 期間の切り出し（スプリント別の集計に使う）─────────────────────────
 *
 *  「いつの分か」は日付で決める。固定費は1件の記録が何か月にもわたって
 *  支払いを生むので、記録がどのスプリントで登録されたかでは決められない。
 *  after は含まず、until は含む（境界日は前のスプリントの分として数える。
 *  スプリントの開始日は前のスプリントの終了日と同じ日付になるため）。
 * ────────────────────────────────────────────────────────────────────────
 */
export interface DateWindow {
  /** この日より後（この日は含まない）。null なら下限なし */
  after: string | null
  /** この日まで（含む） */
  until: string
}

export function inWindow(date: string, window?: DateWindow): boolean {
  if (!window) return true
  if (window.after !== null && date <= window.after) return false
  return date <= window.until
}

/** 支出1件が生む「実際の支払い」を展開した姿。集計はすべてこれを通す */
export interface ExpenseFacts {
  /** 今日までに発生した回数（単発は常に1。window があればその期間内の回数） */
  count: number
  /** 発生ベースの合計（amount × count） */
  accrued: number
  /** チーム口座から出た分（日付ごと） */
  cashOut: Array<{ date: string; amount: number }>
  /** まだ精算していない立替の合計 */
  unsettled: number
}

/**
 * window を渡すと、その期間に入る分だけを切り出す。
 * 発生（支払日）と現金流出（精算日）は別の日付になり得るので、
 * それぞれ自分の日付で期間に入るかを判定する。
 * 例: 4月に立替て6月に精算した支出は、発生は4月のスプリント、
 *     口座からの流出は6月のスプリントに計上される。
 */
export function expenseFacts(
  expense: Expense,
  asOf: string,
  window?: DateWindow,
): ExpenseFacts {
  const dates = paymentDates(expense, asOf)
  const accrualDates = dates.filter((d) => inWindow(d, window))
  const count = accrualDates.length
  const accrued = expense.amount * count

  // チーム口座払いは支払日に、立替は精算してあればその日に口座から出る
  let cash: Array<{ date: string; amount: number }> = []
  if (expense.payer_type === 'team') {
    cash = dates.map((date) => ({ date, amount: expense.amount }))
  } else if (expense.reimbursed) {
    // 単発は精算日、固定費は毎月返している前提でその月の支払日に計上する
    const dateOf = (d: string) =>
      expense.recurrence === 'monthly' ? d : expense.reimbursed_on ?? expense.occurred_on
    cash = dates.map((d) => ({ date: dateOf(d), amount: expense.amount }))
  }

  return {
    count,
    accrued,
    cashOut: cash.filter((c) => inWindow(c.date, window)),
    unsettled: expense.payer_type === 'member' && !expense.reimbursed ? accrued : 0,
  }
}

/**
 * その支出が「今日まで」に発生した支払日を列挙する。
 * 単発なら occurred_on の1件だけ。
 */
export function paymentDates(expense: Expense, asOf: string): string[] {
  if (expense.recurrence !== 'monthly' || expense.payment_day == null) {
    return [expense.occurred_on]
  }

  const limit = expense.recurrence_ends_on && expense.recurrence_ends_on < asOf
    ? expense.recurrence_ends_on
    : asOf

  const dates: string[] = []
  let [year, month] = expense.occurred_on.split('-').map(Number)

  // 上限を付けて、日付が壊れていても無限ループさせない（100年分）
  for (let guard = 0; guard < 1200; guard += 1) {
    const date = clampToMonth(year, month, expense.payment_day)
    if (date > limit) break
    // 開始日より前の支払いは数えない（初月の支払日が開始日より前のケース）
    if (date >= expense.occurred_on) dates.push(date)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return dates
}

/** 支払日をその月に存在する日に丸める（2月31日 → 2月28日） */
function clampToMonth(year: number, month: number, day: number): string {
  const lastDay = new Date(year, month, 0).getDate()
  const d = Math.min(day, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface MemberBalance {
  member: Member
  /** 未精算の立替合計（チームがこの人に返すべき額） */
  unsettled: number
  /** 未精算の立替件数 */
  unsettledCount: number
  /** 立替の累計（精算済みも含む） */
  advancedTotal: number
  /** 納めた会費の累計 */
  feesPaid: number
}

export interface Summary {
  /** 収入の累計 */
  totalIncome: number
  /** 支出の累計（発生ベース。未精算の立替も含む） */
  totalExpense: number
  /** チーム口座から直接支払った累計 */
  paidFromTeamAccount: number
  /** 立替のうち精算済みの累計（＝口座から払い戻した額） */
  reimbursedTotal: number
  /** 未精算の立替の合計 */
  unsettledTotal: number
  /** チーム残高（現在の口座残高） */
  teamBalance: number
  /** 未精算をすべて精算した後に残る額 */
  projectedBalance: number
  /** メンバー別の内訳（表示順） */
  byMember: MemberBalance[]
}

export function summarize(
  incomes: Income[],
  expenses: Expense[],
  members: Member[],
  asOf: string = today(),
  window?: DateWindow,
): Summary {
  const facts = expenses.map((e) => ({ e, f: expenseFacts(e, asOf, window) }))
  const cashOutOf = (x: { f: ExpenseFacts }) => sum(x.f.cashOut, (c) => c.amount)
  const scopedIncomes = incomes.filter((i) => inWindow(i.occurred_on, window))

  const totalIncome = sum(scopedIncomes, (i) => i.amount)
  const totalExpense = sum(facts, (x) => x.f.accrued)

  const paidFromTeamAccount = sum(
    facts.filter((x) => x.e.payer_type === 'team'),
    cashOutOf,
  )
  const reimbursedTotal = sum(
    facts.filter((x) => x.e.payer_type === 'member'),
    cashOutOf,
  )
  const unsettledTotal = sum(facts, (x) => x.f.unsettled)

  const teamBalance = totalIncome - paidFromTeamAccount - reimbursedTotal

  const byMember = members.map<MemberBalance>((member) => {
    const advanced = facts.filter((x) => x.e.payer_type === 'member' && x.e.paid_by === member.id)
    const open = advanced.filter((x) => x.f.unsettled > 0)
    return {
      member,
      unsettled: sum(open, (x) => x.f.unsettled),
      unsettledCount: open.length,
      advancedTotal: sum(advanced, (x) => x.f.accrued),
      feesPaid: sum(
        scopedIncomes.filter((i) => i.member_id === member.id && i.category === 'membership_fee'),
        (i) => i.amount,
      ),
    }
  })

  return {
    totalIncome,
    totalExpense,
    paidFromTeamAccount,
    reimbursedTotal,
    unsettledTotal,
    teamBalance,
    projectedBalance: teamBalance - unsettledTotal,
    byMember,
  }
}

export interface MonthlyPoint {
  /** YYYY-MM */
  month: string
  income: number
  /** その月にチーム口座から出た額 */
  cashOut: number
  /** income - cashOut */
  net: number
  /** その月末時点のチーム残高 */
  balance: number
}

/**
 * 月次の収支と残高推移。データがある最初の月から今月までを、
 * 動きのない月も 0 で埋めて連続させる（折れ線に穴を作らないため）。
 */
export function monthlySeries(
  incomes: Income[],
  expenses: Expense[],
  asOf: string = today(),
  window?: DateWindow,
): MonthlyPoint[] {
  const income = new Map<string, number>()
  const cashOut = new Map<string, number>()

  for (const i of incomes) {
    if (inWindow(i.occurred_on, window)) add(income, monthKey(i.occurred_on), i.amount)
  }
  for (const e of expenses) {
    // 固定費は毎月の支払いに展開されるので、月ごとに正しく積まれる
    for (const c of expenseFacts(e, asOf, window).cashOut) add(cashOut, monthKey(c.date), c.amount)
  }

  const keys = [...income.keys(), ...cashOut.keys()].sort()
  if (keys.length === 0) return []

  // 終了したスプリントの表は終了月で止める（今月まで空の月を並べない）
  const upper = window ? monthKey(window.until) : '9999-12'
  const end = minMonth(maxMonth(keys[keys.length - 1], currentMonth()), upper)
  const months = fillMonths(keys[0], maxMonth(end, keys[0]))

  let running = 0
  return months.map((month) => {
    const inc = income.get(month) ?? 0
    const out = cashOut.get(month) ?? 0
    running += inc - out
    return { month, income: inc, cashOut: out, net: inc - out, balance: running }
  })
}

/** カテゴリ別の支出集計（発生ベース）。金額の大きい順 */
export function byCategory<T extends string>(
  expenses: Expense[],
  pick: (e: Expense) => T,
  asOf: string = today(),
  window?: DateWindow,
): Array<{ key: T; amount: number; count: number }> {
  const map = new Map<T, { amount: number; count: number }>()
  for (const e of expenses) {
    const facts = expenseFacts(e, asOf, window)
    // 期間外の支出（固定費の別スプリント分など）はここに出さない
    if (facts.count === 0) continue
    const key = pick(e)
    const current = map.get(key) ?? { amount: 0, count: 0 }
    current.amount += facts.accrued
    current.count += 1
    map.set(key, current)
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * ── スプリント単位の集計 ────────────────────────────────────────────────
 *
 *  スプリントは「精算を終えてチーム残高を確定させるまで」を1区切りとする単位。
 *  どのスプリントの分かは日付で決まる（記録の sprint_id では判定しない）。
 *  日付で決める理由:
 *    ・固定費は1件の記録が何か月も支払いを生むので、登録したスプリントに
 *      全部乗せると、終了したスプリントの支出が後から増え続けてしまう。
 *    ・締めたあとに思い出した過去日付の支出も、その日付のスプリントに入る。
 *    ・立替を別のスプリントで精算した場合、口座から出た日のスプリントに
 *      現金流出を計上できる。
 *
 *  期首・期末残高は保存せず毎回ここで計算する。保存すると、後から記録を
 *  修正したときに保存値と食い違うため。
 * ────────────────────────────────────────────────────────────────────────
 */
export interface SprintTotals {
  sprint: Sprint
  /** 古い順の連番（表示用。1から始まる） */
  order: number
  isOpen: boolean
  /** このスプリントが受け持つ日付の範囲 */
  window: DateWindow
  income: number
  /** 支出の発生ベース合計（未精算の立替も含む） */
  expense: number
  paidFromTeamAccount: number
  reimbursedTotal: number
  /** このスプリントの立替でまだ精算していない額 */
  unsettled: number
  /** このスプリント中に口座から出た額 */
  cashOut: number
  /** income − cashOut */
  net: number
  /** スプリント開始時点のチーム残高 */
  openingBalance: number
  /** スプリント終了時点（進行中なら現在）のチーム残高 */
  closingBalance: number
  incomeCount: number
  expenseCount: number
}

/** 表示順（古い順）に並べたスプリント。進行中は最後に来る */
export function sortSprints(sprints: Sprint[]): Sprint[] {
  return [...sprints].sort((a, b) => {
    if (a.started_on !== b.started_on) return a.started_on.localeCompare(b.started_on)
    return a.created_at.localeCompare(b.created_at)
  })
}

/**
 * 各スプリントが受け持つ日付の範囲。
 * ・境界日（前のスプリントの終了日）は前のスプリントの分。
 * ・最初のスプリントは開始日より前の日付も引き受ける。
 * ・最後のスプリントは上限なし。どのスプリントにも入らない記録を作らない
 *   ため（合計が黙って減らないようにする）。
 */
export function sprintWindows(sprints: Sprint[]): DateWindow[] {
  const ordered = sortSprints(sprints)
  return ordered.map((sprint, index) => ({
    after: index === 0 ? null : ordered[index - 1].ended_on ?? ordered[index - 1].started_on,
    until: index === ordered.length - 1 ? '9999-12-31' : sprint.ended_on ?? '9999-12-31',
  }))
}

export function sprintTotals(
  sprints: Sprint[],
  incomes: Income[],
  expenses: Expense[],
  asOf: string = today(),
): SprintTotals[] {
  const windows = sprintWindows(sprints)
  let running = 0

  return sortSprints(sprints).map((sprint, index) => {
    const window = windows[index]
    const si = incomes.filter((i) => inWindow(i.occurred_on, window))
    // 期間に1円も関わらない支出は、このスプリントの記録として数えない
    const facts = expenses
      .map((e) => ({ e, f: expenseFacts(e, asOf, window) }))
      .filter((x) => x.f.count > 0 || x.f.cashOut.length > 0)
    const cashOutOf = (x: { f: ExpenseFacts }) => sum(x.f.cashOut, (c) => c.amount)

    const income = sum(si, (i) => i.amount)
    const expense = sum(facts, (x) => x.f.accrued)
    const paidFromTeamAccount = sum(facts.filter((x) => x.e.payer_type === 'team'), cashOutOf)
    const reimbursedTotal = sum(facts.filter((x) => x.e.payer_type === 'member'), cashOutOf)
    const unsettled = sum(facts, (x) => x.f.unsettled)
    const cashOut = paidFromTeamAccount + reimbursedTotal

    const openingBalance = running
    running += income - cashOut

    return {
      sprint,
      order: index + 1,
      isOpen: sprint.ended_on === null,
      window,
      income,
      expense,
      paidFromTeamAccount,
      reimbursedTotal,
      unsettled,
      cashOut,
      net: income - cashOut,
      openingBalance,
      closingBalance: running,
      incomeCount: si.length,
      expenseCount: facts.length,
    }
  })
}

/** その日付を受け持つスプリント（該当なしなら null） */
export function sprintForDate(sprints: Sprint[], date: string): Sprint | null {
  const ordered = sortSprints(sprints)
  const windows = sprintWindows(sprints)
  const index = windows.findIndex((w) => inWindow(date, w))
  return index === -1 ? null : ordered[index]
}

/** 進行中のスプリント（なければ null） */
export function openSprint(sprints: Sprint[]): Sprint | null {
  return sprints.find((s) => s.ended_on === null) ?? null
}

/**
 * sprint_id が入っていない記録の件数。
 * 集計は日付で行うので合計からは漏れない。0002 のマイグレーションを
 * 実行したかどうかを確かめるためだけに使う。
 */
export function unassignedCount(incomes: Income[], expenses: Expense[]): number {
  return (
    incomes.filter((i) => !i.sprint_id).length + expenses.filter((e) => !e.sprint_id).length
  )
}

/**
 * ── スプリントを終わらせるための精算プラン ──────────────────────────
 *
 *  終了条件を「チーム残高がプラス」かつ「全員の負担が均一」と定義して、
 *  そこに到達するために誰がいくら払う／受け取るかを逆算する。
 *
 *  ある人の負担 = 納めた会費 + まだ返してもらっていない立替
 *  立替を全額返せば負担から消えるので、精算後に人ごとの差を作るのは
 *  会費だけになる。つまり「会費の追加徴収・返金」で負担を揃えられる。
 *
 *    目標残高 T、現在の残高 C、未精算の合計 U、会費合計 F、人数 n として
 *      精算後の残高 = C − U + Σaᵢ = T   →   Σaᵢ = T − C + U
 *      全員の負担を等しく B にする      →   aᵢ = B − 会費ᵢ
 *      2式から                          B = (T − C + U + F) ÷ n
 *
 *  aᵢ は「追加で払う会費（＋）／返金される会費（−）」。
 *  実際の振込は立替の返金と相殺して1人1回にまとめる（transfer）。
 * ────────────────────────────────────────────────────────────────────────
 */
export interface MemberSettlement {
  member: Member
  /** このスプリントで納めた会費 */
  feesPaid: number
  /** 返してもらう立替（未精算分） */
  unsettled: number
  /** 精算前の負担 = feesPaid + unsettled */
  currentBurden: number
  /** 会費の調整。+ = 追加で払う / − = 返金される */
  adjustment: number
  /** 立替の返金と相殺した実際のやり取り。+ = チームから受け取る / − = チームに払う */
  transfer: number
  /** 精算後の負担（全員ほぼ同額になる） */
  finalBurden: number
}

export interface SettlementPlan {
  /** 終了時に残したいチーム残高 */
  targetBalance: number
  /** いまの残高（このスプリント時点） */
  closingBalance: number
  unsettledTotal: number
  /** 会費調整の合計。+ = チーム口座に入る */
  adjustmentTotal: number
  /** チームから出ていく合計（立替返金 + 会費返金） */
  payOutTotal: number
  /** チームに入ってくる合計（追加徴収） */
  collectTotal: number
  /** 精算後に1人が負担する額 */
  burdenPerMember: number
  members: MemberSettlement[]
  /** 目標残高が0以上か（チーム残高がプラスという終了条件） */
  targetIsPositive: boolean
  /** 目標を満たすのに追加徴収が必要か */
  needsCollection: boolean
}

export function settlementPlan(
  summary: Summary,
  closingBalance: number,
  targetBalance: number,
): SettlementPlan {
  const rows = summary.byMember
  const n = rows.length

  if (n === 0) {
    return {
      targetBalance,
      closingBalance,
      unsettledTotal: summary.unsettledTotal,
      adjustmentTotal: 0,
      payOutTotal: 0,
      collectTotal: 0,
      burdenPerMember: 0,
      members: [],
      targetIsPositive: targetBalance >= 0,
      needsCollection: false,
    }
  }

  // 会費調整の合計。これだけ口座の増減が要る
  const need = targetBalance - closingBalance + summary.unsettledTotal
  const feesTotal = rows.reduce((s, r) => s + r.feesPaid, 0)
  const burdenExact = (need + feesTotal) / n

  // 1円単位に丸めても合計が need とぴったり合うようにする（最大剰余法）。
  // 端数を切り捨てただけだと数円ずれて、残高が目標に届かない。
  const raw = rows.map((r) => burdenExact - r.feesPaid)
  const floored = raw.map((v) => Math.floor(v))
  let remainder = Math.round(need - floored.reduce((s, v) => s + v, 0))

  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  const adjustments = [...floored]
  for (const { i } of order) {
    if (remainder <= 0) break
    adjustments[i] += 1
    remainder -= 1
  }

  const settlements = rows.map<MemberSettlement>((r, i) => {
    const adjustment = adjustments[i]
    return {
      member: r.member,
      feesPaid: r.feesPaid,
      unsettled: r.unsettled,
      currentBurden: r.feesPaid + r.unsettled,
      adjustment,
      // 立替の返金（受取）と会費調整を相殺して、1人1回のやり取りにする
      transfer: r.unsettled - adjustment,
      finalBurden: r.feesPaid + adjustment,
    }
  })

  return {
    targetBalance,
    closingBalance,
    unsettledTotal: summary.unsettledTotal,
    adjustmentTotal: settlements.reduce((s, m) => s + m.adjustment, 0),
    payOutTotal: settlements.filter((m) => m.transfer > 0).reduce((s, m) => s + m.transfer, 0),
    collectTotal: settlements.filter((m) => m.transfer < 0).reduce((s, m) => s - m.transfer, 0),
    burdenPerMember: Math.round(burdenExact),
    members: settlements,
    targetIsPositive: targetBalance >= 0,
    needsCollection: settlements.some((m) => m.transfer < 0),
  }
}

/** そのレースに紐づく支出の合計 */
export function raceSpend(expenses: Expense[], raceId: UUID, asOf: string = today()): number {
  return sum(
    expenses.filter((e) => e.race_id === raceId),
    (e) => expenseFacts(e, asOf).accrued,
  )
}

// ── ヘルパー ────────────────────────────────────────────────────────────

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0)
}

function add(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function maxMonth(a: string, b: string): string {
  return a > b ? a : b
}

function minMonth(a: string, b: string): string {
  return a < b ? a : b
}

/** 'YYYY-MM' の from..to を1か月刻みで列挙 */
function fillMonths(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  // 上限を付けて、日付が壊れていても無限ループさせない
  for (let guard = 0; guard < 600; guard += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push(key)
    if (key >= to) break
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}
