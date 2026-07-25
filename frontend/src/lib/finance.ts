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

/** 支出1件が生む「実際の支払い」を展開した姿。集計はすべてこれを通す */
export interface ExpenseFacts {
  /** 今日までに発生した回数（単発は常に1） */
  count: number
  /** 発生ベースの合計（amount × count） */
  accrued: number
  /** チーム口座から出た分（日付ごと） */
  cashOut: Array<{ date: string; amount: number }>
  /** まだ精算していない立替の合計 */
  unsettled: number
}

export function expenseFacts(expense: Expense, asOf: string): ExpenseFacts {
  const dates = paymentDates(expense, asOf)
  const count = dates.length
  const accrued = expense.amount * count

  // チーム口座払いは支払日に、立替は精算してあればその日に口座から出る
  if (expense.payer_type === 'team') {
    return { count, accrued, cashOut: dates.map((date) => ({ date, amount: expense.amount })), unsettled: 0 }
  }
  if (expense.reimbursed) {
    // 単発は精算日、固定費は毎月返している前提でその月の支払日に計上する
    const dateOf = (d: string) =>
      expense.recurrence === 'monthly' ? d : expense.reimbursed_on ?? expense.occurred_on
    return {
      count,
      accrued,
      cashOut: dates.map((d) => ({ date: dateOf(d), amount: expense.amount })),
      unsettled: 0,
    }
  }
  return { count, accrued, cashOut: [], unsettled: accrued }
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
): Summary {
  const facts = expenses.map((e) => ({ e, f: expenseFacts(e, asOf) }))
  const cashOutOf = (x: { f: ExpenseFacts }) => sum(x.f.cashOut, (c) => c.amount)

  const totalIncome = sum(incomes, (i) => i.amount)
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
        incomes.filter((i) => i.member_id === member.id && i.category === 'membership_fee'),
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
): MonthlyPoint[] {
  const income = new Map<string, number>()
  const cashOut = new Map<string, number>()

  for (const i of incomes) add(income, monthKey(i.occurred_on), i.amount)
  for (const e of expenses) {
    // 固定費は毎月の支払いに展開されるので、月ごとに正しく積まれる
    for (const c of expenseFacts(e, asOf).cashOut) add(cashOut, monthKey(c.date), c.amount)
  }

  const keys = [...income.keys(), ...cashOut.keys()].sort()
  if (keys.length === 0) return []

  const months = fillMonths(keys[0], maxMonth(keys[keys.length - 1], currentMonth()))

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
): Array<{ key: T; amount: number; count: number }> {
  const map = new Map<T, { amount: number; count: number }>()
  for (const e of expenses) {
    const key = pick(e)
    const current = map.get(key) ?? { amount: 0, count: 0 }
    current.amount += expenseFacts(e, asOf).accrued
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
 *  どのスプリントの記録かは sprint_id で決まる（日付では判定しない）。
 *  期首・期末残高は保存せず毎回ここで計算する。保存すると、後から記録を
 *  修正したときに保存値と食い違うため。
 * ────────────────────────────────────────────────────────────────────────
 */
export interface SprintTotals {
  sprint: Sprint
  /** 古い順の連番（表示用。1から始まる） */
  order: number
  isOpen: boolean
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

export function sprintTotals(
  sprints: Sprint[],
  incomes: Income[],
  expenses: Expense[],
  asOf: string = today(),
): SprintTotals[] {
  let running = 0
  return sortSprints(sprints).map((sprint, index) => {
    const si = incomes.filter((i) => i.sprint_id === sprint.id)
    const se = expenses.filter((e) => e.sprint_id === sprint.id)
    const facts = se.map((e) => ({ e, f: expenseFacts(e, asOf) }))
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
      expenseCount: se.length,
    }
  })
}

/** 進行中のスプリント（なければ null） */
export function openSprint(sprints: Sprint[]): Sprint | null {
  return sprints.find((s) => s.ended_on === null) ?? null
}

/**
 * どのスプリントにも属していない記録の件数。
 * 通常は 0。0 でなければ画面に出して、金額が黙って消えないようにする。
 */
export function unassignedCount(incomes: Income[], expenses: Expense[]): number {
  return (
    incomes.filter((i) => !i.sprint_id).length + expenses.filter((e) => !e.sprint_id).length
  )
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
