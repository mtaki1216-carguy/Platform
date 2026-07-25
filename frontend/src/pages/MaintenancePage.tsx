import { useMemo, useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { useSelfMember } from '../hooks/useSelfMember'
import { Badge, Banner, Card, Empty, Modal, Stat } from '../components/ui'
import { MaintenanceForm } from '../forms/MaintenanceForm'
import { ExpenseForm } from '../forms/ExpenseForm'
import {
  daysFromToday,
  formatDate,
  formatNumber,
  formatRelativeDays,
  formatYen,
} from '../lib/format'
import { MAINTENANCE_CATEGORIES, type MaintenanceRecord } from '../lib/types'

export function MaintenancePage() {
  const { maintenance, expenses, races, memberName, remove } = useTeamData()
  const { selfId } = useSelfMember()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null)
  const [addingCostTo, setAddingCostTo] = useState<MaintenanceRecord | null>(null)
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')

  /** 整備1件ごとの費用（expenses.maintenance_id から引く。整備側に金額は持たない） */
  const costOf = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of expenses) {
      if (e.maintenance_id) map.set(e.maintenance_id, (map.get(e.maintenance_id) ?? 0) + e.amount)
    }
    return map
  }, [expenses])

  const latestOdometer = useMemo(() => {
    const withOdo = maintenance.filter((m) => m.odometer_km != null)
    if (withOdo.length === 0) return null
    return withOdo.reduce((best, m) => (m.odometer_km! > (best.odometer_km ?? 0) ? m : best), withOdo[0])
  }, [maintenance])

  const totalCost = maintenance.reduce((sum, m) => sum + (costOf.get(m.id) ?? 0), 0)

  /** 次回交換の目安が近い／過ぎているもの */
  const dueSoon = useMemo(() => {
    const currentKm = latestOdometer?.odometer_km ?? null
    return maintenance
      .filter((m) => {
        const byDate = m.next_due_on != null && daysFromToday(m.next_due_on) <= 30
        const byKm = m.next_due_km != null && currentKm != null && currentKm >= m.next_due_km - 500
        return byDate || byKm
      })
      .sort((a, b) => (a.next_due_on ?? '9999').localeCompare(b.next_due_on ?? '9999'))
  }, [maintenance, latestOdometer])

  const filtered = maintenance.filter((m) => {
    if (category && m.category !== category) return false
    if (query) {
      const q = query.toLowerCase()
      const haystack = `${m.title} ${m.detail ?? ''} ${m.shop ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  async function onDelete(m: MaintenanceRecord) {
    const linked = costOf.get(m.id)
    const extra = linked
      ? `\nこの整備に紐付いた支出 ${formatYen(linked)} は削除されず、整備との紐付けだけが外れます。`
      : ''
    if (!window.confirm(`「${m.title}」（${formatDate(m.performed_on)}）を削除します。${extra}`)) return
    await remove('maintenance_records', m.id)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>整備記録</h1>
          <p>実施日・走行距離とあわせて整備内容を残します。費用は支出として予算管理に連動します。</p>
        </div>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>
          整備を記録
        </button>
      </div>

      <div className="stack">
        <div className="grid grid--stats">
          <Stat
            label="現在の走行距離"
            value={
              latestOdometer?.odometer_km != null ? `${formatNumber(latestOdometer.odometer_km)} km` : '—'
            }
            note={
              latestOdometer
                ? `${formatDate(latestOdometer.performed_on)} の記録時点`
                : '走行距離を入力すると表示されます'
            }
          />
          <Stat label="整備記録" value={`${maintenance.length} 件`} />
          <Stat label="整備にかかった費用" value={formatYen(totalCost)} note="支出として登録された分の合計" />
          <Stat
            label="交換時期が近い項目"
            value={`${dueSoon.length} 件`}
            tone={dueSoon.length > 0 ? 'bad' : undefined}
            note="日付が30日以内、または残り500km以下"
          />
        </div>

        {dueSoon.length > 0 ? (
          <Banner tone="warning">
            <strong>交換・点検時期が近い項目があります。</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {dueSoon.map((m) => (
                <li key={m.id}>
                  {m.title} —{' '}
                  {m.next_due_on ? `${formatDate(m.next_due_on)}（${formatRelativeDays(m.next_due_on)}）` : null}
                  {m.next_due_on && m.next_due_km ? ' / ' : null}
                  {m.next_due_km ? `${formatNumber(m.next_due_km)} km` : null}
                </li>
              ))}
            </ul>
          </Banner>
        ) : null}

        <Card
          title="記録一覧"
          subtitle={`${filtered.length}件`}
          flush
          actions={
            <div className="toolbar">
              <input
                type="text"
                placeholder="内容・部品・ショップ"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">全区分</option>
                {Object.entries(MAINTENANCE_CATEGORIES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {filtered.length === 0 ? (
            <Empty title="該当する記録がありません">
              条件を変えるか、「整備を記録」から登録してください。
            </Empty>
          ) : (
            <div className="table-scroll table-scroll--wide">
              <table>
                <thead>
                  <tr>
                    <th>実施日</th>
                    <th className="num">走行距離</th>
                    <th>区分</th>
                    <th className="col-title">整備内容</th>
                    <th>作業者 / 場所</th>
                    <th>次回目安</th>
                    <th className="num">費用</th>
                    <th className="col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const race = races.find((r) => r.id === m.race_id)
                    const cost = costOf.get(m.id)
                    return (
                      <tr key={m.id}>
                        <td className="nowrap">{formatDate(m.performed_on)}</td>
                        <td className="num">
                          {m.odometer_km != null ? `${formatNumber(m.odometer_km)} km` : '—'}
                        </td>
                        <td className="nowrap">
                          <Badge tone="neutral">{MAINTENANCE_CATEGORIES[m.category]}</Badge>
                        </td>
                        <td>
                          {m.title}
                          {m.detail ? <span className="sub">{m.detail}</span> : null}
                          {race ? <span className="sub">🏁 {race.name}</span> : null}
                        </td>
                        <td>
                          {m.performed_by ? memberName(m.performed_by) : '—'}
                          {m.shop ? <span className="sub">{m.shop}</span> : null}
                        </td>
                        <td className="nowrap">
                          {m.next_due_on ? (
                            <span>
                              {formatDate(m.next_due_on)}
                              <span className="sub">{formatRelativeDays(m.next_due_on)}</span>
                            </span>
                          ) : null}
                          {m.next_due_km != null ? (
                            <span className={m.next_due_on ? 'sub' : undefined}>
                              {formatNumber(m.next_due_km)} km
                            </span>
                          ) : null}
                          {!m.next_due_on && m.next_due_km == null ? '—' : null}
                        </td>
                        <td className="num">
                          {cost != null ? (
                            formatYen(cost)
                          ) : (
                            <button className="btn btn--ghost btn--sm" onClick={() => setAddingCostTo(m)}>
                              費用を追加
                            </button>
                          )}
                        </td>
                        <td className="col-actions">
                          <button className="btn btn--ghost btn--sm" onClick={() => setEditing(m)}>
                            編集
                          </button>
                          <button
                            className="btn btn--ghost btn--sm btn--danger"
                            onClick={() => void onDelete(m)}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {creating ? (
        <Modal title="整備を記録" onClose={() => setCreating(false)} wide>
          <MaintenanceForm defaultMemberId={selfId} onDone={() => setCreating(false)} />
        </Modal>
      ) : null}

      {editing ? (
        <Modal title="整備記録を編集" onClose={() => setEditing(null)} wide>
          <MaintenanceForm initial={editing} onDone={() => setEditing(null)} />
        </Modal>
      ) : null}

      {addingCostTo ? (
        <Modal title={`費用を登録 — ${addingCostTo.title}`} onClose={() => setAddingCostTo(null)}>
          <ExpenseForm
            defaultMemberId={selfId}
            preset={{
              category: 'maintenance',
              description: addingCostTo.title,
              maintenanceId: addingCostTo.id,
              raceId: addingCostTo.race_id ?? undefined,
            }}
            onDone={() => setAddingCostTo(null)}
          />
        </Modal>
      ) : null}
    </>
  )
}
