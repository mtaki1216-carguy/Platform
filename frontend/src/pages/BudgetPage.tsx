import { useMemo, useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { useSelfMember } from '../hooks/useSelfMember'
import { Badge, Banner, Card, Empty, Modal } from '../components/ui'
import { BalanceChart } from '../charts/BalanceChart'
import { MonthlyBars } from '../charts/MonthlyBars'
import { IncomeForm } from '../forms/IncomeForm'
import { ExpenseForm } from '../forms/ExpenseForm'
import { byCategory } from '../lib/finance'
import { formatDate, formatMonth, formatYen, formatYenSigned, today } from '../lib/format'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type Expense,
  type Income,
} from '../lib/types'

export function BudgetPage() {
  const { summary, monthly, expenses } = useTeamData()
  const [dialog, setDialog] = useState<'income' | 'expense' | null>(null)
  const { selfId } = useSelfMember()

  return (
    <>
      <div className="page-head">
        <div>
          <h1>予算管理</h1>
          <p>
            チーム残高は「チーム口座に今いくらあるか」です。個人立替は精算した時点で口座から出ていくため、
            未精算のうちは残高に含まれません。
          </p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => setDialog('income')}>
            収入を登録
          </button>
          <button className="btn btn--primary" onClick={() => setDialog('expense')}>
            支出を登録
          </button>
        </div>
      </div>

      <div className="stack">
        {summary.projectedBalance < 0 ? (
          <Banner tone="critical">
            <strong>未精算の立替を全額返すと残高がマイナスになります。</strong>{' '}
            不足額は {formatYen(-summary.projectedBalance)} です。会費の追加徴収を検討してください。
          </Banner>
        ) : null}

        <div className="grid grid--two">
          <Card title="チーム残高の推移" subtitle="各月末時点の口座残高">
            <BalanceChart data={monthly} />
          </Card>
          <Card title="月ごとの収支" subtitle="支出は口座から実際に出た額（立替は精算した月に計上）">
            <MonthlyBars data={monthly} />
          </Card>
        </div>

        <MonthlyTable />

        <SettlementCard />

        <CategoryBreakdown expenses={expenses} />

        <ExpenseTable defaultMemberId={selfId} />

        <IncomeTable defaultMemberId={selfId} />
      </div>

      {dialog === 'income' ? (
        <Modal title="収入を登録" onClose={() => setDialog(null)}>
          <IncomeForm defaultMemberId={selfId} onDone={() => setDialog(null)} />
        </Modal>
      ) : null}

      {dialog === 'expense' ? (
        <Modal title="支出を登録" onClose={() => setDialog(null)}>
          <ExpenseForm defaultMemberId={selfId} onDone={() => setDialog(null)} />
        </Modal>
      ) : null}
    </>
  )
}

/** グラフの数値を表でも読めるようにする（色に頼らない経路を必ず残す） */
function MonthlyTable() {
  const { monthly } = useTeamData()
  const [open, setOpen] = useState(false)

  if (monthly.length === 0) return null

  return (
    <Card
      title="月次の内訳"
      subtitle="上のグラフと同じ数字を表で確認できます"
      flush
      actions={
        <button className="btn btn--sm" onClick={() => setOpen(!open)}>
          {open ? '閉じる' : '表を開く'}
        </button>
      }
    >
      {open ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>月</th>
                <th className="num">収入</th>
                <th className="num">支出（口座から）</th>
                <th className="num">収支</th>
                <th className="num">月末残高</th>
              </tr>
            </thead>
            <tbody>
              {[...monthly].reverse().map((m) => (
                <tr key={m.month}>
                  <td className="nowrap">{formatMonth(m.month)}</td>
                  <td className="num">{formatYen(m.income)}</td>
                  <td className="num">{formatYen(m.cashOut)}</td>
                  <td className={`num ${m.net < 0 ? 'value-bad' : m.net > 0 ? 'value-good' : ''}`}>
                    {formatYenSigned(m.net)}
                  </td>
                  <td className="num">{formatYen(m.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  )
}

/** 誰にいくら返すべきか。まとめて精算できるようにする */
function SettlementCard() {
  const { summary, expenses, update, reload } = useTeamData()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function settleAll(memberId: string, memberName: string) {
    const open = expenses.filter(
      (e) => e.payer_type === 'member' && e.paid_by === memberId && !e.reimbursed,
    )
    const total = open.reduce((sum, e) => sum + e.amount, 0)
    const ok = window.confirm(
      `${memberName} への立替 ${open.length}件（${formatYen(total)}）をすべて精算済みにします。\n精算日は本日（${formatDate(today())}）で記録されます。`,
    )
    if (!ok) return

    setBusyId(memberId)
    setError(null)
    try {
      for (const e of open) {
        await update('expenses', e.id, { reimbursed: true, reimbursed_on: today() })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      await reload()
    } finally {
      setBusyId(null)
    }
  }

  const rows = summary.byMember

  return (
    <Card title="立替の精算状況" subtitle="チームがメンバーに返すべき金額" flush>
      {error ? (
        <div style={{ padding: 16 }}>
          <Banner tone="critical">{error}</Banner>
        </div>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>メンバー</th>
              <th className="num">未精算</th>
              <th className="num">件数</th>
              <th className="num">立替 累計</th>
              <th className="num">納入した会費</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.member.id}>
                <td className="nowrap">{row.member.name}</td>
                <td className={`num ${row.unsettled > 0 ? 'value-bad' : ''}`}>
                  {row.unsettled > 0 ? formatYen(row.unsettled) : '—'}
                </td>
                <td className="num">{row.unsettledCount || '—'}</td>
                <td className="num">{formatYen(row.advancedTotal)}</td>
                <td className="num">{formatYen(row.feesPaid)}</td>
                <td className="col-actions">
                  {row.unsettled > 0 ? (
                    <button
                      className="btn btn--sm"
                      disabled={busyId !== null}
                      onClick={() => void settleAll(row.member.id, row.member.name)}
                    >
                      {busyId === row.member.id ? '精算中…' : 'まとめて精算'}
                    </button>
                  ) : (
                    <Badge tone="good">精算済み</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>合計</td>
              <td className={`num ${summary.unsettledTotal > 0 ? 'value-bad' : ''}`}>
                {formatYen(summary.unsettledTotal)}
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

/** 費目別の支出（単一の指標なので色は1つ。値は棒の先に直接置く） */
function CategoryBreakdown({ expenses }: { expenses: Expense[] }) {
  const rows = useMemo(() => byCategory(expenses, (e) => e.category), [expenses])
  if (rows.length === 0) return null
  const max = rows[0].amount

  return (
    <Card title="費目別の支出" subtitle="発生ベース（未精算の立替も含む）">
      <div className="rank">
        {rows.map((row) => (
          <div key={row.key} style={{ display: 'contents' }}>
            <span className="rank__name">{EXPENSE_CATEGORIES[row.key]}</span>
            <span className="meter">
              <span className="meter__fill" style={{ width: `${(row.amount / max) * 100}%` }} />
            </span>
            <span className="rank__value">{formatYen(row.amount)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── 支出一覧 ───────────────────────────────────────────────────────────

function ExpenseTable({ defaultMemberId }: { defaultMemberId: string }) {
  const { expenses, races, members, memberName, update, remove } = useTeamData()
  const [editing, setEditing] = useState<Expense | null>(null)
  const [category, setCategory] = useState('')
  const [payer, setPayer] = useState('')
  const [unsettledOnly, setUnsettledOnly] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = expenses.filter((e) => {
    if (category && e.category !== category) return false
    if (payer === 'team' && e.payer_type !== 'team') return false
    if (payer === 'member' && e.payer_type !== 'member') return false
    if (payer.startsWith('m:') && e.paid_by !== payer.slice(2)) return false
    if (unsettledOnly && !(e.payer_type === 'member' && !e.reimbursed)) return false
    if (query) {
      const q = query.toLowerCase()
      const haystack = `${e.description} ${e.note ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const total = filtered.reduce((sum, e) => sum + e.amount, 0)

  async function onDelete(e: Expense) {
    if (!window.confirm(`「${e.description}」（${formatYen(e.amount)}）を削除します。`)) return
    await remove('expenses', e.id)
  }

  async function toggleReimbursed(e: Expense) {
    await update('expenses', e.id, {
      reimbursed: !e.reimbursed,
      reimbursed_on: e.reimbursed ? null : today(),
    })
  }

  return (
    <Card
      title="支出"
      subtitle={`${filtered.length}件 / 合計 ${formatYen(total)}`}
      flush
      actions={
        <div className="toolbar">
          <input
            type="text"
            placeholder="内容で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">全費目</option>
            {Object.entries(EXPENSE_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select value={payer} onChange={(e) => setPayer(e.target.value)}>
            <option value="">全支払元</option>
            <option value="team">チーム口座</option>
            <option value="member">個人立替（全員）</option>
            {members.map((m) => (
              <option key={m.id} value={`m:${m.id}`}>
                立替: {m.name}
              </option>
            ))}
          </select>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={unsettledOnly}
              onChange={(e) => setUnsettledOnly(e.target.checked)}
            />
            未精算のみ
          </label>
        </div>
      }
    >
      {filtered.length === 0 ? (
        <Empty title="該当する支出がありません">条件を変えるか、支出を登録してください。</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>支払日</th>
                <th className="col-title">内容</th>
                <th>費目</th>
                <th>支払元</th>
                <th className="num">金額</th>
                <th>精算</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const race = races.find((r) => r.id === e.race_id)
                return (
                  <tr key={e.id}>
                    <td className="nowrap">{formatDate(e.occurred_on)}</td>
                    <td>
                      {e.description}
                      {race ? <span className="sub">🏁 {race.name}</span> : null}
                      {e.note ? <span className="sub">{e.note}</span> : null}
                    </td>
                    <td className="nowrap">{EXPENSE_CATEGORIES[e.category]}</td>
                    <td className="nowrap">
                      {e.payer_type === 'team' ? (
                        <Badge tone="neutral">チーム口座</Badge>
                      ) : (
                        <Badge tone="info">{memberName(e.paid_by)} 立替</Badge>
                      )}
                    </td>
                    <td className="num">{formatYen(e.amount)}</td>
                    <td className="nowrap">
                      {e.payer_type === 'team' ? (
                        <span style={{ color: 'var(--ink-muted)' }}>—</span>
                      ) : e.reimbursed ? (
                        <Badge tone="good">
                          精算済{e.reimbursed_on ? ` ${formatDate(e.reimbursed_on)}` : ''}
                        </Badge>
                      ) : (
                        <button className="btn btn--sm" onClick={() => void toggleReimbursed(e)}>
                          精算する
                        </button>
                      )}
                    </td>
                    <td className="col-actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(e)}>
                        編集
                      </button>
                      <button
                        className="btn btn--ghost btn--sm btn--danger"
                        onClick={() => void onDelete(e)}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>表示中の合計</td>
                <td className="num">{formatYen(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editing ? (
        <Modal title="支出を編集" onClose={() => setEditing(null)}>
          <ExpenseForm
            initial={editing}
            defaultMemberId={defaultMemberId}
            onDone={() => setEditing(null)}
          />
        </Modal>
      ) : null}
    </Card>
  )
}

// ── 収入一覧 ───────────────────────────────────────────────────────────

function IncomeTable({ defaultMemberId }: { defaultMemberId: string }) {
  const { incomes, memberName, remove } = useTeamData()
  const [editing, setEditing] = useState<Income | null>(null)
  const [category, setCategory] = useState('')

  const filtered = incomes.filter((i) => !category || i.category === category)
  const total = filtered.reduce((sum, i) => sum + i.amount, 0)

  async function onDelete(i: Income) {
    if (!window.confirm(`${formatDate(i.occurred_on)} の収入 ${formatYen(i.amount)} を削除します。`)) return
    await remove('incomes', i.id)
  }

  return (
    <Card
      title="収入"
      subtitle={`${filtered.length}件 / 合計 ${formatYen(total)}`}
      flush
      actions={
        <div className="toolbar">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">全種別</option>
            {Object.entries(INCOME_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {filtered.length === 0 ? (
        <Empty title="収入の記録がありません">会費の入金を登録すると残高が計算されます。</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>入金日</th>
                <th>種別</th>
                <th>納入者</th>
                <th className="num">金額</th>
                <th>メモ</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td className="nowrap">{formatDate(i.occurred_on)}</td>
                  <td className="nowrap">{INCOME_CATEGORIES[i.category]}</td>
                  <td className="nowrap">{memberName(i.member_id)}</td>
                  <td className="num">{formatYen(i.amount)}</td>
                  <td>{i.note ?? ''}</td>
                  <td className="col-actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => setEditing(i)}>
                      編集
                    </button>
                    <button
                      className="btn btn--ghost btn--sm btn--danger"
                      onClick={() => void onDelete(i)}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>表示中の合計</td>
                <td className="num">{formatYen(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editing ? (
        <Modal title="収入を編集" onClose={() => setEditing(null)}>
          <IncomeForm
            initial={editing}
            defaultMemberId={defaultMemberId}
            onDone={() => setEditing(null)}
          />
        </Modal>
      ) : null}
    </Card>
  )
}
