/** DB のテーブル定義に 1:1 で対応する型。supabase/migrations/0001_init.sql が正。 */

export type UUID = string
/** ISO 形式の日付 (YYYY-MM-DD) */
export type ISODate = string

/**
 * 予算を区切る単位。名前は未入力（null）で自動的に始まり、後から付けられる。
 * ended_on が null のものが進行中で、DB 側の部分ユニークインデックスにより
 * 進行中は常に1つだけになる。
 */
export interface Sprint {
  id: UUID
  name: string | null
  started_on: ISODate
  ended_on: ISODate | null
  note: string | null
  created_at: string
}

export interface Member {
  id: UUID
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export const INCOME_CATEGORIES = {
  membership_fee: '会費',
  sponsor: 'スポンサー',
  carryover: '繰越金',
  refund: '返金・払戻',
  other: 'その他',
} as const
export type IncomeCategory = keyof typeof INCOME_CATEGORIES

export interface Income {
  id: UUID
  sprint_id: UUID | null
  occurred_on: ISODate
  category: IncomeCategory
  member_id: UUID | null
  amount: number
  note: string | null
  created_at: string
}

export const EXPENSE_CATEGORIES = {
  parts: 'パーツ',
  consumables: '消耗品',
  tire: 'タイヤ',
  fuel: '燃料',
  entry_fee: '参加費',
  transport: '輸送・遠征',
  maintenance: '整備・工賃',
  insurance: '保険',
  equipment: '装備品',
  other: 'その他',
} as const
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES

/** team = チーム口座から直接支払い / member = メンバーの個人立替 */
export type PayerType = 'team' | 'member'

/** once = 単発 / monthly = 毎月払いの固定費 */
export type Recurrence = 'once' | 'monthly'

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  once: '単発',
  monthly: '固定費（毎月）',
}

export interface Expense {
  id: UUID
  sprint_id: UUID | null
  occurred_on: ISODate
  category: ExpenseCategory
  description: string
  amount: number
  payer_type: PayerType
  paid_by: UUID | null
  reimbursed: boolean
  reimbursed_on: ISODate | null
  race_id: UUID | null
  maintenance_id: UUID | null
  note: string | null
  created_at: string

  recurrence: Recurrence
  /** 毎月の支払日（1〜31）。monthly のときのみ入る */
  payment_day: number | null
  /** 固定費を止めた日。null なら継続中 */
  recurrence_ends_on: ISODate | null
}

export const MAINTENANCE_CATEGORIES = {
  engine: 'エンジン',
  brake: 'ブレーキ',
  tire: 'タイヤ',
  wheel: 'ホイール',
  suspension: 'サスペンション',
  drivetrain: '駆動系',
  electrical: '電装',
  cooling: '冷却系',
  body: '外装・ボディ',
  fluid: 'オイル交換',
  inspection: '点検・車検',
  other: 'その他',
} as const
export type MaintenanceCategory = keyof typeof MAINTENANCE_CATEGORIES

export interface MaintenanceRecord {
  id: UUID
  performed_on: ISODate
  odometer_km: number | null
  category: MaintenanceCategory
  title: string
  detail: string | null
  performed_by: UUID | null
  shop: string | null
  next_due_on: ISODate | null
  next_due_km: number | null
  race_id: UUID | null
  created_at: string
}

export const RACE_STATUSES = {
  considering: '検討中',
  planned: '参加予定',
  applied: '申込済',
  accepted: 'エントリー受理',
  declined: '不参加',
  finished: '終了',
  cancelled: '中止',
} as const
export type RaceStatus = keyof typeof RACE_STATUSES

/** ステータスごとのバッジ配色トークン（styles.css の .badge--* に対応） */
export const RACE_STATUS_TONE: Record<RaceStatus, string> = {
  considering: 'neutral',
  planned: 'info',
  applied: 'warning',
  accepted: 'good',
  declined: 'muted',
  finished: 'muted',
  cancelled: 'critical',
}

/**
 * 一覧で状況を一目で見分けるための色。
 * 色だけで意味を運ばせないよう、必ずラベル（プルダウンの文字）の隣に置く。
 */
export const RACE_STATUS_COLOR: Record<RaceStatus, string> = {
  considering: '#898781',
  planned: '#2a78d6',
  applied: '#fab219',
  accepted: '#0ca30c',
  declined: '#c3c2b7',
  finished: '#898781',
  cancelled: '#d03b3b',
}

export interface Race {
  id: UUID
  name: string
  circuit: string | null
  starts_on: ISODate
  ends_on: ISODate | null
  entry_fee: number
  entry_opens_on: ISODate | null
  entry_deadline: ISODate | null
  applied_on: ISODate | null
  status: RaceStatus
  fee_paid: boolean
  url: string | null
  note: string | null
  created_at: string
}

export const PARTICIPANT_ROLES = {
  driver: 'ドライバー',
  pit: 'ピット',
  support: 'サポート',
} as const
export type ParticipantRole = keyof typeof PARTICIPANT_ROLES

export interface RaceParticipant {
  race_id: UUID
  member_id: UUID
  role: ParticipantRole
}
