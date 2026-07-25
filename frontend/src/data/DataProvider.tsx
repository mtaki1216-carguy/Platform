import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { describeError, supabase } from '../lib/supabase'
import { monthlySeries, summarize, type MonthlyPoint, type Summary } from '../lib/finance'
import type {
  Expense,
  Income,
  MaintenanceRecord,
  Member,
  Race,
  RaceParticipant,
  UUID,
} from '../lib/types'

/** リアルタイム同期の対象テーブル */
const TABLES = [
  'members',
  'incomes',
  'expenses',
  'races',
  'maintenance_records',
  'race_participants',
] as const

export type TableName = (typeof TABLES)[number]

interface TeamData {
  loading: boolean
  error: string | null
  lastSyncedAt: Date | null

  members: Member[]
  incomes: Income[]
  expenses: Expense[]
  races: Race[]
  maintenance: MaintenanceRecord[]
  participants: RaceParticipant[]

  /** 残高などの集計。lib/finance.ts が唯一の計算元 */
  summary: Summary
  monthly: MonthlyPoint[]

  memberName: (id: UUID | null) => string
  reload: () => Promise<void>

  /** 追加した行を返す（整備記録に費用を紐付けるときに id が必要） */
  insert: <T = Record<string, unknown>>(table: TableName, row: Record<string, unknown>) => Promise<T>
  update: (table: TableName, id: UUID, patch: Record<string, unknown>) => Promise<void>
  remove: (table: TableName, id: UUID) => Promise<void>
  setParticipant: (raceId: UUID, memberId: UUID, role: string) => Promise<void>
  removeParticipant: (raceId: UUID, memberId: UUID) => Promise<void>
}

const Context = createContext<TeamData | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  const [members, setMembers] = useState<Member[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [races, setRaces] = useState<Race[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
  const [participants, setParticipants] = useState<RaceParticipant[]>([])

  const reload = useCallback(async () => {
    const [m, i, e, r, mr, rp] = await Promise.all([
      supabase.from('members').select('*').order('sort_order'),
      supabase.from('incomes').select('*').order('occurred_on', { ascending: false }),
      supabase.from('expenses').select('*').order('occurred_on', { ascending: false }),
      supabase.from('races').select('*').order('starts_on'),
      supabase.from('maintenance_records').select('*').order('performed_on', { ascending: false }),
      supabase.from('race_participants').select('*'),
    ])

    const failed = [m, i, e, r, mr, rp].find((res) => res.error)
    if (failed?.error) {
      setError(describeError(failed.error))
      setLoading(false)
      return
    }

    setMembers((m.data ?? []) as Member[])
    setIncomes((i.data ?? []) as Income[])
    setExpenses((e.data ?? []) as Expense[])
    setRaces((r.data ?? []) as Race[])
    setMaintenance((mr.data ?? []) as MaintenanceRecord[])
    setParticipants((rp.data ?? []) as RaceParticipant[])
    setError(null)
    setLastSyncedAt(new Date())
    setLoading(false)
  }, [])

  // 初回ロード
  useEffect(() => {
    void reload()
  }, [reload])

  // ── リアルタイム同期 ───────────────────────────────────────────────
  // 5人分の小さなデータなので、変更通知が来たら全件読み直す方が
  // 差分をローカルに当てるより単純で、取りこぼしも起きない。
  // 連続した変更でリクエストが跳ねないよう 250ms まとめる。
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void reloadRef.current(), 250)
    }

    const channel = supabase.channel('team-platform')
    for (const table of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule)
    }
    channel.subscribe()

    // タブに戻ってきたときは、切断中に来た更新を取りに行く
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [])

  // ── 書き込み ───────────────────────────────────────────────────────
  // 失敗は throw する（フォーム側で受けてその場に表示する）。
  // 成功したら自分の画面はすぐ更新し、他の端末には Realtime が届く。
  const insert = useCallback(
    async <T,>(table: TableName, row: Record<string, unknown>): Promise<T> => {
      const { data, error: err } = await supabase.from(table).insert(row).select().single()
      if (err) throw new Error(describeError(err))
      await reload()
      return data as T
    },
    [reload],
  )

  const update = useCallback(
    async (table: TableName, id: UUID, patch: Record<string, unknown>) => {
      const { error: err } = await supabase.from(table).update(patch).eq('id', id)
      if (err) throw new Error(describeError(err))
      await reload()
    },
    [reload],
  )

  const remove = useCallback(
    async (table: TableName, id: UUID) => {
      const { error: err } = await supabase.from(table).delete().eq('id', id)
      if (err) throw new Error(describeError(err))
      await reload()
    },
    [reload],
  )

  const setParticipant = useCallback(
    async (raceId: UUID, memberId: UUID, role: string) => {
      const { error: err } = await supabase
        .from('race_participants')
        .upsert({ race_id: raceId, member_id: memberId, role }, { onConflict: 'race_id,member_id' })
      if (err) throw new Error(describeError(err))
      await reload()
    },
    [reload],
  )

  const removeParticipant = useCallback(
    async (raceId: UUID, memberId: UUID) => {
      const { error: err } = await supabase
        .from('race_participants')
        .delete()
        .eq('race_id', raceId)
        .eq('member_id', memberId)
      if (err) throw new Error(describeError(err))
      await reload()
    },
    [reload],
  )

  const summary = useMemo(() => summarize(incomes, expenses, members), [incomes, expenses, members])
  const monthly = useMemo(() => monthlySeries(incomes, expenses), [incomes, expenses])

  const memberName = useCallback(
    (id: UUID | null) => (id ? members.find((m) => m.id === id)?.name ?? '（削除済み）' : '—'),
    [members],
  )

  const value: TeamData = {
    loading,
    error,
    lastSyncedAt,
    members,
    incomes,
    expenses,
    races,
    maintenance,
    participants,
    summary,
    monthly,
    memberName,
    reload,
    insert,
    update,
    remove,
    setParticipant,
    removeParticipant,
  }

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useTeamData(): TeamData {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useTeamData は DataProvider の中で呼んでください')
  return ctx
}
