import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { useSelfMember } from '../hooks/useSelfMember'
import { Badge, Banner, Card, Field, Modal, Stat } from '../components/ui'
import { formatYen } from '../lib/format'
import type { Member } from '../lib/types'

export function MembersPage() {
  const { members, summary, insert, update, remove } = useTeamData()
  const { selfId, setSelfId, selfName } = useSelfMember()

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (!name.trim()) throw new Error('名前を入力してください')
      const nextOrder = Math.max(0, ...members.map((m) => m.sort_order)) + 1
      await insert('members', { name: name.trim(), sort_order: nextOrder })
      setName('')
      setAdding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 立替の支払者として支出に載っている人は DB 側（on delete restrict）で削除できない。
   * 「誰が払ったか」を後から消せてしまうと会計が追えなくなるため、これは意図した制約。
   */
  function blockedReason(m: Member): string | null {
    const balance = summary.byMember.find((b) => b.member.id === m.id)
    if (!balance) return null
    if (balance.unsettledCount > 0) {
      return `未精算の立替が ${balance.unsettledCount}件（${formatYen(balance.unsettled)}）残っています。先に予算管理で精算してください。`
    }
    if (balance.advancedTotal > 0) {
      return '立替の支払者として支出に記録されているため削除できません。名前の変更で対応してください。'
    }
    return null
  }

  async function onDelete(m: Member) {
    const blocked = blockedReason(m)
    if (blocked) {
      window.alert(`${m.name} は削除できません。\n\n${blocked}`)
      return
    }
    if (
      !window.confirm(
        `${m.name} を削除します。\n会費や整備記録は残りますが、納入者・作業者の表示は「（削除済み）」になります。`,
      )
    ) {
      return
    }
    setError(null)
    try {
      await remove('members', m.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>メンバー</h1>
          <p>
            チーム全員が同じアカウントでログインするため、この端末を使っているのが誰かを設定しておくと、
            立替者や作業者の入力が省けます。
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setAdding(true)}>
          メンバーを追加
        </button>
      </div>

      <div className="stack">
        <Card title="この端末を使っている人" subtitle="フォームの初期値に使われます。ブラウザにだけ保存されます">
          <Field label="自分">
            <select value={selfId} onChange={(e) => setSelfId(e.target.value)}>
              <option value="">（未設定）</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          {selfName ? (
            <p style={{ marginBottom: 0, color: 'var(--ink-2)', fontSize: 13 }}>
              支出・整備の登録画面で {selfName} が最初から選ばれます。
            </p>
          ) : null}
        </Card>

        <div className="grid grid--stats">
          <Stat label="メンバー" value={`${members.length} 名`} />
          <Stat label="会費 累計" value={formatYen(summary.byMember.reduce((s, m) => s + m.feesPaid, 0))} />
          <Stat
            label="未精算の立替"
            value={formatYen(summary.unsettledTotal)}
            tone={summary.unsettledTotal > 0 ? 'bad' : undefined}
          />
        </div>

        {error ? <Banner tone="critical">{error}</Banner> : null}

        <Card title="一覧" flush>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>名前</th>
                  <th className="num">納入した会費</th>
                  <th className="num">立替 累計</th>
                  <th className="num">未精算</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {summary.byMember.map((row) => (
                  <tr key={row.member.id}>
                    <td className="nowrap">
                      {row.member.name}
                      {row.member.id === selfId ? (
                        <span className="sub">
                          <Badge tone="info">自分</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="num">{formatYen(row.feesPaid)}</td>
                    <td className="num">{formatYen(row.advancedTotal)}</td>
                    <td className={`num ${row.unsettled > 0 ? 'value-bad' : ''}`}>
                      {row.unsettled > 0 ? formatYen(row.unsettled) : '—'}
                    </td>
                    <td className="col-actions">
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          const next = window.prompt('名前を変更', row.member.name)
                          if (next && next.trim() && next.trim() !== row.member.name) {
                            void update('members', row.member.id, { name: next.trim() })
                          }
                        }}
                      >
                        名前を変更
                      </button>
                      <button
                        className="btn btn--ghost btn--sm btn--danger"
                        onClick={() => void onDelete(row.member)}
                        disabled={blockedReason(row.member) !== null}
                        title={blockedReason(row.member) ?? undefined}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {adding ? (
        <Modal title="メンバーを追加" onClose={() => setAdding(false)}>
          <form onSubmit={addMember}>
            <Field label="名前" required>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </Field>
            {error ? <div className="form-error">{error}</div> : null}
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setAdding(false)} disabled={busy}>
                キャンセル
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? '追加中…' : '追加'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
