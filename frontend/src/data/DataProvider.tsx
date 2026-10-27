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
  SharedExpense,
  SharedShare,
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

/**
 * 割り勘の2テーブル（0005_shared_expenses.sql）。
 * マイグレーション未実行でも他の画面が壊れないよう、上の TABLES とは別に扱う。
 */
const SHARED_TABLES = ['shared_expenses', 'shared_expense_shares'] as const

export type TableName = (typeof TABLES)[number] | (typeof SHARED_TABLES)[number]

/** テーブルがまだ無い（マイグレーション未実行）ときのエラーか */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return (
    err.code === 'PGRST205' ||
    err.code === '42P01' ||
    /schema cache|does not exist/i.test(err.message ?? '')
  )
}

/** 割り勘 1件ぶんの書き込み内容 */
export interface SharedExpenseInput {
  occurred_on: string
  category: string | null
  description: string
  amount: number
  paid_by: UUID
  race_id: UUID | null
  note: string | null
}

export interface SharedShareInput {
  member_id: UUID
  amount: number
  /** 立替者本人の分は最初から返済済みにする */
  settled: boolean
}

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
  /** 割り勘（メンバー間の貸し借り）。チーム残高には含まれない */
  sharedExpenses: SharedExpense[]
  shares: SharedShare[]
  /** 0005 のマイグレーションが済んでいるか。false の間は割り勘を登録できない */
  sharedAvailable: boolean

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
  /** 割り勘を登録する。対象メンバーの負担額も一緒に保存する（途中で失敗したら取り消す） */
  createSharedExpense: (expense: SharedExpenseInput, shares: SharedShareInput[]) => Promise<void>
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
  const [sharedExpenses, setSharedExpenses] = useState<SharedExpense[]>([])
  const [shares, setShares] = useState<SharedShare[]>([])
  const [sharedAvailable, setSharedAvailable] = useState(false)

  const reload = useCallback(async () => {
    const [sp, m, i, e, r, mr, rp, se, ss] = await Promise.all([
      supabase.from('sprints').select('*').order('started_on'),
      supabase.from('members').select('*').order('sort_order'),
      supabase.from('incomes').select('*').order('occurred_on', { ascending: false }),
      supabase.from('expenses').select('*').order('occurred_on', { ascending: false }),
      supabase.from('races').select('*').order('starts_on'),
      supabase.from('maintenance_records').select('*').order('performed_on', { ascending: false }),
      supabase.from('race_participants').select('*'),
      supabase.from('shared_expenses').select('*').order('occurred_on', { ascending: false }),
      supabase.from('shared_expense_shares').select('*'),
    ])

    // 割り勘のテーブルが無いのは「まだ 0005 を実行していない」だけなので、エラーにしない
    const sharedMissing = isMissingTable(se.error) || isMissingTable(ss.error)
    const failed = [sp, m, i, e, r, mr, rp, ...(sharedMissing ? [] : [se, ss])].find((res) => res.error)
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
    setSharedExpenses(sharedMissing ? [] : ((se.data ?? []) as SharedExpense[]))
    setShares(sharedMissing ? [] : ((ss.data ?? []) as SharedShare[]))
    setSharedAvailable(!sharedMissing)
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

    // 割り勘のテーブルは別のチャンネルにする。まだテーブルが無い環境で購読に失敗しても、
    // 上の本体の同期に影響させないため。
    const sharedChannel = supabase.channel('team-platform-shared')
    for (const table of SHARED_TABLES) {
      sharedChannel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule)
    }
    sharedChannel.subscribe()

    // タブに戻ってきたときは、切断中に来た更新を取りに行く
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
      void supabase.removeChannel(sharedChannel)
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

  const createSharedExpense = useCallback(
    async (expense: SharedExpenseInput, shareRows: SharedShareInput[]) => {
      const { data, error: err } = await supabase.from('shared_expenses').insert(expense).select().single()
      if (err) throw new Error(describeError(err))
      const created = data as SharedExpense

      const rows = shareRows.map((r) => ({
        shared_expense_id: created.id,
        member_id: r.member_id,
        amount: r.amount,
        settled: r.settled,
        settled_on: r.settled ? expense.occurred_on : null,
      }))
      const { error: shareErr } = await supabase.from('shared_expense_shares').insert(rows)
      if (shareErr) {
        // 負担額のない割り勘が残らないよう、本体も取り消す
        await supabase.from('shared_expenses').delete().eq('id', created.id)
        await reload()
        throw new Error(describeError(shareErr))
      }
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
    sharedExpenses,
    shares,
    sharedAvailable,
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
    createSharedExpense,
  }

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useTeamData(): TeamData {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useTeamData は DataProvider の中で呼んでください')
  return ctx
}
