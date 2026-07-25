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
import {
  monthlySeries,
  openSprint,
  sprintTotals,
  summarize,
  type MonthlyPoint,
  type SprintTotals,
  type Summary,
} from '../lib/finance'
import { today } from '../lib/format'
import type {
  Expense,
  Income,
  MaintenanceRecord,
  Member,
  Race,
  RaceParticipant,
  Sprint,
  UUID,
} from '../lib/types'

/** リアルタイム同期の対象テーブル */
const TABLES = [
  'sprints',
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

  sprints: Sprint[]
  members: Member[]
  incomes: Income[]
  expenses: Expense[]
  races: Race[]
  maintenance: MaintenanceRecord[]
  participants: RaceParticipant[]

  /** 残高などの集計。lib/finance.ts が唯一の計算元 */
  summary: Summary
  monthly: MonthlyPoint[]
  /** スプリントごとの集計（古い順） */
  sprintStats: SprintTotals[]
  /** 進行中のスプリント。まだ無い場合のみ null */
  currentSprint: Sprint | null

  /**
   * 進行中のスプリントを返す。無ければ名前なしで1つ作る。
   * 収入・支出を登録する直前に呼ぶことで、記録が必ずどれかの
   * スプリントに属するようにしている。
   */
  ensureOpenSprint: () => Promise<Sprint>
  /** 進行中のスプリントを終了し、続けて新しいスプリントを開始する */
  closeSprint: (patch: { name: string | null; ended_on: string; note: string | null }) => Promise<void>

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

  const [sprints, setSprints] = useState<Sprint[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [races, setRaces] = useState<Race[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
  const [participants, setParticipants] = useState<RaceParticipant[]>([])

  const reload = useCallback(async () => {
    const [sp, m, i, e, r, mr, rp] = await Promise.all([
      supabase.from('sprints').select('*').order('started_on'),
      supabase.from('members').select('*').order('sort_order'),
      supabase.from('incomes').select('*').order('occurred_on', { ascending: false }),
      supabase.from('expenses').select('*').order('occurred_on', { ascending: false }),
      supabase.from('races').select('*').order('starts_on'),
      supabase.from('maintenance_records').select('*').order('performed_on', { ascending: false }),
      supabase.from('race_participants').select('*'),
    ])

    const failed = [sp, m, i, e, r, mr, rp].find((res) => res.error)
    if (failed?.error) {
      setError(describeError(failed.error))
      setLoading(false)
      return
    }

    setSprints((sp.data ?? []) as Sprint[])
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
  const sprintStats = useMemo(() => sprintTotals(sprints, incomes, expenses), [sprints, incomes, expenses])
  const currentSprint = useMemo(() => openSprint(sprints), [sprints])

  /**
   * 進行中のスプリントが無ければ作る。
   * 5人が同時に操作しても2つ開かないよう DB に部分ユニークインデックスがあるので、
   * 衝突したら読み直して、相手が作ったものを使う。
   */
  const ensureOpenSprint = useCallback(async (): Promise<Sprint> => {
    const existing = openSprint(sprints)
    if (existing) return existing

    const { data, error: err } = await supabase
      .from('sprints')
      .insert({ name: null, started_on: today() })
      .select()
      .single()

    if (err) {
      // 23505 = unique 制約違反。他の端末が一瞬先に作った場合
      const { data: raced } = await supabase
        .from('sprints')
        .select('*')
        .is('ended_on', null)
        .limit(1)
        .maybeSingle()
      if (raced) {
        await reload()
        return raced as Sprint
      }
      throw new Error(describeError(err))
    }

    await reload()
    return data as Sprint
  }, [sprints, reload])

  /**
   * 進行中のスプリントを終了し、続けて次のスプリントを名前なしで開始する。
   * 「終了したのに次が始まっていない」状態を作らないため、この2つは必ず対で行う。
   */
  const closeSprint = useCallback(
    async (patch: { name: string | null; ended_on: string; note: string | null }) => {
      const open = openSprint(sprints)
      if (!open) throw new Error('進行中のスプリントがありません')
      if (patch.ended_on < open.started_on) {
        throw new Error('終了日は開始日以降にしてください')
      }

      const { error: closeErr } = await supabase
        .from('sprints')
        .update({ name: patch.name, ended_on: patch.ended_on, note: patch.note })
        .eq('id', open.id)
      if (closeErr) throw new Error(describeError(closeErr))

      const { error: openErr } = await supabase
        .from('sprints')
        .insert({ name: null, started_on: patch.ended_on })
      if (openErr) {
        // 次のスプリントが作れなかったら、終了を取り消して元に戻す
        await supabase.from('sprints').update({ ended_on: null }).eq('id', open.id)
        await reload()
        throw new Error(`次のスプリントを開始できませんでした: ${describeError(openErr)}`)
      }

      await reload()
    },
    [sprints, reload],
  )

  const memberName = useCallback(
    (id: UUID | null) => (id ? members.find((m) => m.id === id)?.name ?? '（削除済み）' : '—'),
    [members],
  )

  const value: TeamData = {
    loading,
    error,
    lastSyncedAt,
    sprints,
    members,
    incomes,
    expenses,
    races,
    maintenance,
    participants,
    summary,
    monthly,
    sprintStats,
    currentSprint,
    ensureOpenSprint,
    closeSprint,
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
