import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { sharedDebts } from '../lib/finance'
import { formatDate, formatYen, today } from '../lib/format'
import { EXPENSE_CATEGORIES, type SharedExpense, type SharedShare } from '../lib/types'
import { Badge, Banner, Card } from './ui'

/**
 * 割り勘（メンバー間の貸し借り）。
 * チーム口座を通らないので、残高や立替の精算状況とは別に、誰が誰にいくら返すかだけを出す。
 */
export function SharedExpenseCard() {
  const { sharedExpenses, shares, members, memberName, update, remove } = useTeamData()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (sharedExpenses.length === 0) return null

  const debts = sharedDebts(sharedExpenses, shares)
  const memberOrder = new Map(members.map((m, i) => [m.id, i]))

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const toggleSettled = (share: SharedShare, settled: boolean) =>
    run(share.id, () =>
      update('shared_expense_shares', share.id, {
        settled,
        settled_on: settled ? today() : null,
      }),
    )

  async function onDelete(e: SharedExpense) {
    if (!window.confirm(`割り勘「${e.description}」（${formatYen(e.amount)}）を削除します。\n返済の記録もいっしょに消えます。`)) {
      return
    }
    await run(e.id, () => remove('shared_expenses', e.id))
  }

  return (
    <Card
      title="割り勘（メンバー間の貸し借り）"
      subtitle="チーム口座を通らないやり取りです。チーム残高・立替の精算状況には含まれません"
      flush
    >
      {error ? (
        <div style={{ padding: 16 }}>
          <Banner tone="critical">{error}</Banner>
        </div>
      ) : null}

      <div className="debts">
        {debts.length === 0 ? (
          <Badge tone="good">すべて返済済み</Badge>
        ) : (
          <>
            <span className="debts__label">未返済</span>
            {debts.map((d) => (
              <span key={`${d.debtorId}>${d.creditorId}`} className="debt">
                {memberName(d.debtorId)}
                <span className="debt__arrow" aria-label="から">
                  →
                </span>
                {memberName(d.creditorId)}
                <b className="num">{formatYen(d.amount)}</b>
                {d.count > 1 ? <span className="debt__count">{d.count}件</span> : null}
              </span>
            ))}
          </>
        )}
      </div>

      <div className="table-scroll table-scroll--wide">
        <table>
          <thead>
            <tr>
              <th>支払日</th>
              <th className="col-title">内容</th>
              <th>立替者</th>
              <th className="num">金額</th>
              <th>内訳（返す人 → 立替者）</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {sharedExpenses.map((e) => {
              const rows = shares
                .filter((s) => s.shared_expense_id === e.id)
                .sort((a, b) => (memberOrder.get(a.member_id) ?? 0) - (memberOrder.get(b.member_id) ?? 0))
              return (
                <tr key={e.id}>
                  <td className="nowrap">{formatDate(e.occurred_on)}</td>
                  <td>
                    {e.description}
                    {e.category ? (
                      <span className="sub">
                        {EXPENSE_CATEGORIES[e.category] ?? e.category}・{rows.length}人で割り勘
                      </span>
                    ) : null}
                  </td>
                  <td className="nowrap">{memberName(e.paid_by)}</td>
                  <td className="num">{formatYen(e.amount)}</td>
                  <td>
                    <ul className="share-list">
                      {rows.map((s) => {
                        const isPayer = s.member_id === e.paid_by
                        return (
                          <li key={s.id}>
                            <span className="share-list__name">{memberName(s.member_id)}</span>
                            <span className="num share-list__amount">{formatYen(s.amount)}</span>
                            {isPayer ? (
                              <Badge tone="muted">立替者本人</Badge>
                            ) : s.settled ? (
                              <>
                                <Badge tone="good">返済済 {s.settled_on ? formatDate(s.settled_on) : ''}</Badge>
                                <button
                                  className="btn btn--ghost btn--sm"
                                  disabled={busyId !== null}
                                  onClick={() => void toggleSettled(s, false)}
                                >
                                  戻す
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn btn--sm"
                                disabled={busyId !== null}
                                onClick={() => void toggleSettled(s, true)}
                              >
                                {busyId === s.id ? '更新中…' : '返済済みにする'}
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </td>
                  <td className="col-actions">
                    <button
                      className="btn btn--ghost btn--sm btn--danger"
                      disabled={busyId !== null}
                      onClick={() => void onDelete(e)}
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
    </Card>
  )
}
