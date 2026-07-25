import type { ISODate } from './types'

const yen = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
})

const plain = new Intl.NumberFormat('ja-JP')

/** ¥1,234,567 — 負数は -¥1,234 になる */
export function formatYen(value: number): string {
  return yen.format(Math.round(value))
}

/** 符号付き。差額や残高の増減表示に使う */
export function formatYenSigned(value: number): string {
  const rounded = Math.round(value)
  if (rounded === 0) return formatYen(0)
  return (rounded > 0 ? '+' : '−') + yen.format(Math.abs(rounded))
}

export function formatNumber(value: number): string {
  return plain.format(value)
}

/** グラフの軸ラベル用。12,000 → 1.2万 */
export function formatYenCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 100_000_000) return `${sign}${strip(abs / 100_000_000)}億`
  if (abs >= 10_000) return `${sign}${strip(abs / 10_000)}万`
  return `${sign}${plain.format(abs)}`
}

function strip(n: number): string {
  return String(Math.round(n * 10) / 10)
}

/** 2026/07/25 */
export function formatDate(iso: ISODate | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${y}/${m}/${d}`
}

/** 7/25（同一年内の短縮表示） */
export function formatDateShort(iso: ISODate | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

/** 開催期間。単日なら 2026/07/25、複数日なら 2026/07/25〜26 */
export function formatDateRange(start: ISODate, end: ISODate | null): string {
  if (!end || end === start) return formatDate(start)
  const [sy, sm] = start.split('-')
  const [ey, em, ed] = end.split('-')
  if (sy === ey && sm === em) return `${formatDate(start)}〜${Number(ed)}`
  if (sy === ey) return `${formatDate(start)}〜${Number(em)}/${Number(ed)}`
  return `${formatDate(start)}〜${formatDate(end)}`
}

/** 2026-07 → 2026年7月 */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年${Number(m)}月`
}

/** 2026-07 → 7月（グラフの軸用。1月だけ年を添える） */
export function formatMonthAxis(ym: string): string {
  const [y, m] = ym.split('-')
  return Number(m) === 1 ? `${y.slice(2)}/1` : `${Number(m)}月`
}

/** ローカルタイムでの今日。new Date().toISOString() は UTC ずれを起こすため使わない */
export function today(): ISODate {
  const d = new Date()
  return toISODate(d)
}

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7)
}

/** iso が今日から何日後か。過去なら負数 */
export function daysFromToday(iso: ISODate): number {
  const MS_PER_DAY = 86_400_000
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - base) / MS_PER_DAY)
}

/** 「あと3日」「3日前」のような相対表現 */
export function formatRelativeDays(iso: ISODate | null): string | null {
  if (!iso) return null
  const diff = daysFromToday(iso)
  if (diff === 0) return '本日'
  if (diff > 0) return `あと${diff}日`
  return `${-diff}日前`
}
