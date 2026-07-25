import { useMemo, useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { useSelfMember } from '../hooks/useSelfMember'
import { Badge, Banner, Card, Empty, Modal, Stat } from '../components/ui'
import { RaceForm } from '../forms/RaceForm'
import { ExpenseForm } from '../forms/ExpenseForm'
import { raceSpend } from '../lib/finance'
import { daysFromToday, formatDate, formatDateRange, formatRelativeDays, formatYen, today } from '../lib/format'
import {
  PARTICIPANT_ROLES,
  RACE_STATUSES,
  RACE_STATUS_COLOR,
  type ParticipantRole,
  type Race,
  type RaceStatus,
} from '../lib/types'

/** 「まだ申し込んでいない＝これから動く必要がある」ステータス */
const OPEN_STATUSES: RaceStatus[] = ['considering', 'planned']

/** 受付開始が「近い」と見なす日数 */
const OPENING_SOON_DAYS = 14

export function RacesPage() {
  const { races, expenses, update, remove } = useTeamData()
  const { selfId } = useSelfMember()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Race | null>(null)
  const [participantsOf, setParticipantsOf] = useState<Race | null>(null)
  const [payingFor, setPayingFor] = useState<Race | null>(null)
  const [showPast, setShowPast] = useState(false)

  const { upcoming, past } = useMemo(() => {
    const now = today()
    const lastDay = (r: Race) => r.ends_on ?? r.starts_on
    const sorted = [...races].sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    return {
      upcoming: sorted.filter((r) => lastDay(r) >= now),
      past: sorted.filter((r) => lastDay(r) < now).reverse(),
    }
  }, [races])

  /**
   * 申込受付がこれから始まるレース。
   * 受付開始日が今日以降で、2週間以内に来るもの（開始済みのものは含めない）。
   */
  const openingSoon = races
    .filter((r) => r.entry_opens_on)
    .filter((r) => {
      const days = daysFromToday(r.entry_opens_on!)
      return days >= 0 && days <= OPENING_SOON_DAYS
    })
    .sort((a, b) => a.entry_opens_on!.localeCompare(b.entry_opens_on!))

  /** 締切が残っていて、まだ申し込んでいないレース */
  const deadlineAlerts = upcoming
    .filter((r) => r.entry_deadline && OPEN_STATUSES.includes(r.status))
    .filter((r) => daysFromToday(r.entry_deadline!) <= 21)
    .sort((a, b) => a.entry_deadline!.localeCompare(b.entry_deadline!))

  async function onDelete(r: Race) {
    const spend = raceSpend(expenses, r.id)
    const extra = spend
      ? `\nこのレースに紐付いた支出 ${formatYen(spend)} は削除されず、レースとの紐付けだけが外れます。`
      : ''
    if (!window.confirm(`「${r.name}」を削除します。${extra}`)) return
    await remove('races', r.id)
  }

  async function changeStatus(r: Race, status: RaceStatus) {
    // 「申込済」にしたのに申込日が空だと後から追えないので、その場で今日を入れる
    const patch: Record<string, unknown> = { status }
    if (status === 'applied' && !r.applied_on) patch.applied_on = today()
    await update('races', r.id, patch)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>レース管理</h1>
          <p>出場予定レースの日程・参加費・申込締切と、いま各レースがどこまで進んでいるかを一覧で確認します。</p>
        </div>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>
          レースを登録
        </button>
      </div>

      <div className="stack">
        <div className="stat-single">
          <Stat
            label="申込開始日が近いレース"
            value={`${openingSoon.length} 件`}
            tone={openingSoon.length > 0 ? 'bad' : undefined}
            note={`受付開始まで${OPENING_SOON_DAYS}日以内`}
          />
        </div>

        {openingSoon.length > 0 ? (
          <Banner tone="info">
            <strong>もうすぐ申込受付が始まります。</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {openingSoon.map((r) => (
                <li key={r.id}>
                  {r.name} — 受付開始 {formatDate(r.entry_opens_on)}（
                  {formatRelativeDays(r.entry_opens_on)}）
                </li>
              ))}
            </ul>
          </Banner>
        ) : null}

        {deadlineAlerts.length > 0 ? (
          <Banner tone="warning">
            <strong>申込締切が近づいています。</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {deadlineAlerts.map((r) => (
                <li key={r.id}>
                  {r.name} — 締切 {formatDate(r.entry_deadline)}（{formatRelativeDays(r.entry_deadline)}）
                  {daysFromToday(r.entry_deadline!) < 0 ? '：締切を過ぎています' : ''}
                </li>
              ))}
            </ul>
          </Banner>
        ) : null}

        <RaceTable
          title="今後のレース"
          races={upcoming}
          emptyTitle="予定されているレースがありません"
          onEdit={setEditing}
          onDelete={onDelete}
          onStatus={changeStatus}
          onParticipants={setParticipantsOf}
          onPayFee={setPayingFor}
        />

        <Card
          title="過去のレース"
          subtitle={`${past.length}件`}
          flush
          actions={
            <button className="btn btn--sm" onClick={() => setShowPast(!showPast)}>
              {showPast ? '閉じる' : '表示する'}
            </button>
          }
        >
          {showPast ? (
            past.length === 0 ? (
              <Empty title="過去のレースはまだありません" />
            ) : (
              <RaceRows
                races={past}
                onEdit={setEditing}
                onDelete={onDelete}
                onStatus={changeStatus}
                onParticipants={setParticipantsOf}
                onPayFee={setPayingFor}
              />
            )
          ) : null}
        </Card>
      </div>

      {creating ? (
        <Modal title="レースを登録" onClose={() => setCreating(false)} wide>
          <RaceForm onDone={() => setCreating(false)} />
        </Modal>
      ) : null}

      {editing ? (
        <Modal title="レースを編集" onClose={() => setEditing(null)} wide>
          <RaceForm initial={editing} onDone={() => setEditing(null)} />
        </Modal>
      ) : null}

      {participantsOf ? (
        <Modal title={`参加メンバー — ${participantsOf.name}`} onClose={() => setParticipantsOf(null)}>
          <ParticipantsEditor race={participantsOf} />
        </Modal>
      ) : null}

      {payingFor ? (
        <Modal title={`参加費を支出として登録 — ${payingFor.name}`} onClose={() => setPayingFor(null)}>
          <ParticipationFeeForm race={payingFor} selfId={selfId} onDone={() => setPayingFor(null)} />
        </Modal>
      ) : null}
    </>
  )
}

interface RowActions {
  onEdit: (r: Race) => void
  onDelete: (r: Race) => Promise<void>
  onStatus: (r: Race, status: RaceStatus) => Promise<void>
  onParticipants: (r: Race) => void
  onPayFee: (r: Race) => void
}

function RaceTable({
  title,
  races,
  emptyTitle,
  ...actions
}: RowActions & { title: string; races: Race[]; emptyTitle: string }) {
  return (
    <Card title={title} subtitle={`${races.length}件`} flush>
      {races.length === 0 ? (
        <Empty title={emptyTitle}>「レースを登録」から出場を検討しているレースを追加できます。</Empty>
      ) : (
        <RaceRows races={races} {...actions} />
      )}
    </Card>
  )
}

function RaceRows({ races, onEdit, onDelete, onStatus, onParticipants, onPayFee }: RowActions & { races: Race[] }) {
  const { expenses, participants, memberName } = useTeamData()

  return (
    <div className="table-scroll table-scroll--wide">
      <table>
        <thead>
          <tr>
            <th className="col-title">レース</th>
            <th>開催日</th>
            <th>申込締切</th>
            <th>申込状況</th>
            <th className="num">参加費</th>
            <th>参加メンバー</th>
            <th className="col-actions" />
          </tr>
        </thead>
        <tbody>
          {races.map((r) => {
            const spend = raceSpend(expenses, r.id)
            const crew = participants.filter((p) => p.race_id === r.id)
            const deadlineDays = r.entry_deadline ? daysFromToday(r.entry_deadline) : null
            const deadlineUrgent =
              deadlineDays !== null && deadlineDays <= 14 && OPEN_STATUSES.includes(r.status)

            return (
              <tr key={r.id}>
                <td>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                  {r.circuit ? <span className="sub">{r.circuit}</span> : null}
                  {r.note ? <span className="sub">{r.note}</span> : null}
                </td>
                <td className="nowrap">
                  {formatDateRange(r.starts_on, r.ends_on)}
                  <span className="sub">{formatRelativeDays(r.starts_on)}</span>
                </td>
                <td className="nowrap">
                  {r.entry_deadline ? (
                    <>
                      {formatDate(r.entry_deadline)}
                      <span className={`sub${deadlineUrgent ? ' value-bad' : ''}`}>
                        {formatRelativeDays(r.entry_deadline)}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                  {r.entry_opens_on ? (
                    <span className="sub">受付開始 {formatDate(r.entry_opens_on)}</span>
                  ) : null}
                </td>
                <td className="nowrap">
                  {/* 一覧のまま状況を進められるようにする。
                      色の丸は一目での見分け用で、意味はプルダウンの文字が担う */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span className="dot" style={{ background: RACE_STATUS_COLOR[r.status] }} />
                    <select
                      value={r.status}
                      onChange={(e) => void onStatus(r, e.target.value as RaceStatus)}
                      aria-label={`${r.name} の申込状況`}
                      style={{ minWidth: 132 }}
                    >
                      {Object.entries(RACE_STATUSES).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="sub">
                    {r.applied_on ? `申込 ${formatDate(r.applied_on)}` : '未申込'}
                  </span>
                </td>
                <td className="num">
                  {r.entry_fee > 0 ? formatYen(r.entry_fee) : '—'}
                  <span className="sub" style={{ textAlign: 'right' }}>
                    {r.fee_paid ? (
                      <Badge tone="good">支払済</Badge>
                    ) : r.entry_fee > 0 ? (
                      <Badge tone="warning">未払い</Badge>
                    ) : null}
                  </span>
                  {/* 実際に支出として計上された額。参加費と食い違っていたら気付けるよう並べる */}
                  {spend > 0 ? (
                    <span className="sub" style={{ textAlign: 'right' }}>
                      支出計上 {formatYen(spend)}
                    </span>
                  ) : null}
                  {r.entry_fee > 0 && !r.fee_paid ? (
                    <span className="sub" style={{ textAlign: 'right' }}>
                      <button className="btn btn--ghost btn--sm" onClick={() => onPayFee(r)}>
                        参加費を計上
                      </button>
                    </span>
                  ) : null}
                </td>
                <td>
                  <div className="chips">
                    {crew.length === 0 ? (
                      <span style={{ color: 'var(--ink-muted)' }}>未定</span>
                    ) : (
                      crew.map((p) => (
                        <Badge key={p.member_id} tone={p.role === 'driver' ? 'info' : 'neutral'}>
                          {memberName(p.member_id)}
                          {p.role !== 'driver' ? `・${PARTICIPANT_ROLES[p.role]}` : ''}
                        </Badge>
                      ))
                    )}
                  </div>
                  <span className="sub">
                    <button className="btn btn--ghost btn--sm" onClick={() => onParticipants(r)}>
                      変更
                    </button>
                  </span>
                </td>
                <td className="col-actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => onEdit(r)}>
                    編集
                  </button>
                  <button className="btn btn--ghost btn--sm btn--danger" onClick={() => void onDelete(r)}>
                    削除
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** 参加メンバーと役割の切り替え */
function ParticipantsEditor({ race }: { race: Race }) {
  const { members, participants, setParticipant, removeParticipant } = useTeamData()
  const [error, setError] = useState<string | null>(null)
  const crew = participants.filter((p) => p.race_id === race.id)

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <p style={{ marginTop: 0, color: 'var(--ink-2)', fontSize: 13 }}>
        参加する人にチェックを入れ、役割を選んでください。
      </p>
      <div className="stack">
        {members.map((m) => {
          const entry = crew.find((p) => p.member_id === m.id)
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                paddingBottom: 10,
                borderBottom: '1px solid var(--gridline)',
              }}
            >
              <label className="checkbox-row" style={{ flex: 1 }}>
                <input
                  type="checkbox"
                  checked={Boolean(entry)}
                  onChange={(e) =>
                    void run(() =>
                      e.target.checked
                        ? setParticipant(race.id, m.id, 'driver')
                        : removeParticipant(race.id, m.id),
                    )
                  }
                />
                {m.name}
              </label>
              <select
                value={entry?.role ?? 'driver'}
                disabled={!entry}
                onChange={(e) =>
                  void run(() => setParticipant(race.id, m.id, e.target.value as ParticipantRole))
                }
                style={{ width: 140 }}
                aria-label={`${m.name} の役割`}
              >
                {Object.entries(PARTICIPANT_ROLES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
      {error ? <div className="form-error">{error}</div> : null}
    </div>
  )
}

/**
 * 参加費を支出として計上する。
 * 支出を登録できたら、そのレースの「支払済」フラグも合わせて立てる。
 */
function ParticipationFeeForm({
  race,
  selfId,
  onDone,
}: {
  race: Race
  selfId: string
  onDone: () => void
}) {
  const { update } = useTeamData()

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Banner tone="info">
          登録すると、このレースの参加費を「支払済」にします。金額は参加費（{formatYen(race.entry_fee)}
          ）が初期値です。
        </Banner>
      </div>
      <ExpenseForm
        defaultMemberId={selfId}
        preset={{
          category: 'entry_fee',
          description: `${race.name} 参加費`,
          amount: race.entry_fee,
          raceId: race.id,
        }}
        onSaved={async () => {
          if (!race.fee_paid) await update('races', race.id, { fee_paid: true })
        }}
        onDone={onDone}
      />
    </>
  )
}
