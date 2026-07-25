import { monthKey } from './format'
import type { Expense, Income, Member, UUID } from './types'

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

/** その支出でチーム口座から現金が出た日。まだ出ていなければ null */
export function cashOutDate(expense: Expense): string | null {
  if (expense.payer_type === 'team') return expense.occurred_on
  if (expense.reimbursed) return expense.reimbursed_on ?? expense.occurred_on
  return null
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

export function summarize(incomes: Income[], expenses: Expense[], members: Member[]): Summary {
  const totalIncome = sum(incomes, (i) => i.amount)
  const totalExpense = sum(expenses, (e) => e.amount)

  const paidFromTeamAccount = sum(
    expenses.filter((e) => e.payer_type === 'team'),
    (e) => e.amount,
  )
  const reimbursedTotal = sum(
    expenses.filter((e) => e.payer_type === 'member' && e.reimbursed),
    (e) => e.amount,
  )
  const unsettledTotal = sum(
    expenses.filter((e) => e.payer_type === 'member' && !e.reimbursed),
    (e) => e.amount,
  )

  const teamBalance = totalIncome - paidFromTeamAccount - reimbursedTotal

  const byMember = members.map<MemberBalance>((member) => {
    const advanced = expenses.filter((e) => e.payer_type === 'member' && e.paid_by === member.id)
    const open = advanced.filter((e) => !e.reimbursed)
    return {
      member,
      unsettled: sum(open, (e) => e.amount),
      unsettledCount: open.length,
      advancedTotal: sum(advanced, (e) => e.amount),
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
export function monthlySeries(incomes: Income[], expenses: Expense[]): MonthlyPoint[] {
  const income = new Map<string, number>()
  const cashOut = new Map<string, number>()

  for (const i of incomes) add(income, monthKey(i.occurred_on), i.amount)
  for (const e of expenses) {
    const date = cashOutDate(e)
    if (date) add(cashOut, monthKey(date), e.amount)
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
): Array<{ key: T; amount: number; count: number }> {
  const map = new Map<T, { amount: number; count: number }>()
  for (const e of expenses) {
    const key = pick(e)
    const current = map.get(key) ?? { amount: 0, count: 0 }
    current.amount += e.amount
    current.count += 1
    map.set(key, current)
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.amount - a.amount)
}

/** そのレースに紐づく支出の合計 */
export function raceSpend(expenses: Expense[], raceId: UUID): number {
  return sum(
    expenses.filter((e) => e.race_id === raceId),
    (e) => e.amount,
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
