import { useMemo, useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { useSelfMember } from '../hooks/useSelfMember'
import { Badge, Card, Empty, Modal } from '../components/ui'
import { MaintenanceForm } from '../forms/MaintenanceForm'
import { ExpenseForm } from '../forms/ExpenseForm'
import { formatDate, formatNumber, formatYen } from '../lib/format'
import { MAINTENANCE_CATEGORIES, type MaintenanceRecord } from '../lib/types'

export function MaintenancePage() {
  const { maintenance, expenses, remove } = useTeamData()
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

  const filtered = maintenance.filter((m) => {
    if (category && m.category !== category) return false
    if (query) {
      const q = query.toLowerCase()
      const haystack = `${m.title} ${m.detail ?? ''}`.toLowerCase()
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
        <Card
          title="記録一覧"
          subtitle={`${filtered.length}件`}
          flush
          actions={
            <div className="toolbar">
              <input
                type="text"
                placeholder="内容・部品で検索"
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
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>実施日</th>
                    <th className="num">走行距離</th>
                    <th>区分</th>
                    <th className="col-title">整備内容</th>
                    <th className="num">費用</th>
                    <th className="col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
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
            }}
            onDone={() => setAddingCostTo(null)}
          />
        </Modal>
      ) : null}
    </>
  )
}
