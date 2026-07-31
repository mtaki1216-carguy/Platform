import { useMemo, useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { useSelfMember } from '../hooks/useSelfMember'
import { Badge, Banner, Card, Empty, Modal } from '../components/ui'
import { MonthlyBars } from '../charts/MonthlyBars'
import { IncomeForm } from '../forms/IncomeForm'
import { ExpenseForm } from '../forms/ExpenseForm'
import { CloseSprintForm } from '../forms/CloseSprintForm'
import {
  byCategory,
  expenseFacts,
  inWindow,
  monthlySeries,
  settlementPlan,
  summarize,
  type DateWindow,
  type SprintTotals,
  type Summary,
} from '../lib/finance'
import {
  formatDate,
  formatMonth,
  formatYen,
  formatYenSigned,
  today,
} from '../lib/format'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type Expense,
  type Income,
} from '../lib/types'

/** 名前が未入力のスプリントは連番で呼ぶ */
export function sprintLabel(t: SprintTotals): string {
  return t.sprint.name?.trim() || `第${t.order}スプリント`
}

/** 進行中は終了日を空けておく（「進行中」はバッジ側が言うので重ねない） */
function sprintPeriod(t: SprintTotals): string {
  return t.sprint.ended_on
    ? `${formatDate(t.sprint.started_on)} 〜 ${formatDate(t.sprint.ended_on)}`
    : `${formatDate(t.sprint.started_on)} 〜`
}

export function BudgetPage() {
  const { sprintStats, members, incomes, expenses, summary, update } = useTeamData()
  const [dialog, setDialog] = useState<'income' | 'expense' | 'close' | null>(null)
  const [pickedId, setPickedId] = useState<string>('')
  const { selfId } = useSelfMember()

  // 既定では進行中のスプリントを見る
  const selected =
    sprintStats.find((s) => s.sprint.id === pickedId) ??
    sprintStats.find((s) => s.isOpen) ??
    sprintStats[sprintStats.length - 1]

  /**
   * 選択中のスプリントの期間に入る記録だけを切り出す。
   * 固定費は1件で何か月ぶんも支払いを生むので、記録そのものではなく
   * 「その期間に入る支払い」で数える（window を各集計に渡す）。
   */
  const scoped = useMemo(() => {
    if (!selected) {
      return {
        incomes: [] as Income[],
        expenses: [] as Expense[],
        summary: summarize([], [], members),
        monthly: [],
        window: undefined as DateWindow | undefined,
      }
    }
    const w = selected.window
    const si = incomes.filter((i) => inWindow(i.occurred_on, w))
    const se = expenses.filter((e) => {
      const f = expenseFacts(e, today(), w)
      return f.count > 0 || f.cashOut.length > 0
    })
    return {
      incomes: si,
      expenses: se,
      summary: summarize(si, se, members, today(), w),
      monthly: monthlySeries(si, se, today(), w),
      window: w,
    }
  }, [selected, incomes, expenses, members])

  if (!selected) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>予算管理</h1>
          </div>
        </div>
        <Card>
          <Empty title="スプリントがまだありません">
            収入または支出を登録すると、最初のスプリントが自動で始まります。
          </Empty>
          <div className="form-actions">
            <button className="btn" onClick={() => setDialog('income')}>
              収入を登録
            </button>
            <button className="btn btn--primary" onClick={() => setDialog('expense')}>
              支出を登録
            </button>
          </div>
        </Card>
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

  async function rename() {
    const next = window.prompt('スプリント名（空欄にすると連番表示に戻ります）', selected!.sprint.name ?? '')
    if (next === null) return
    await update('sprints', selected!.sprint.id, { name: next.trim() || null })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>予算管理</h1>
          <p>
            予算はスプリント単位で区切ります。精算を終えてチーム残高が確定したら、
            スプリントを終了すると次のスプリントが自動で始まります。
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
            <strong>未精算の立替を全額返すと、チーム残高がマイナスになります。</strong>{' '}
            不足額は {formatYen(-summary.projectedBalance)} です（全スプリント通算）。
          </Banner>
        ) : null}

        <Card
          title={
            <span className="sprint-head">
              <span>{sprintLabel(selected)}</span>
              {selected.isOpen ? (
                <Badge tone="good">進行中</Badge>
              ) : (
                <Badge tone="muted">終了</Badge>
              )}
              <span className="sprint-head__period">{sprintPeriod(selected)}</span>
            </span>
          }
          actions={
            <div className="toolbar">
              {sprintStats.length > 1 ? (
                <select
                  value={selected.sprint.id}
                  onChange={(e) => setPickedId(e.target.value)}
                  aria-label="表示するスプリント"
                >
                  {[...sprintStats].reverse().map((t) => (
                    <option key={t.sprint.id} value={t.sprint.id}>
                      {sprintLabel(t)}
                      {t.isOpen ? '（進行中）' : ''}
                    </option>
                  ))}
                </select>
              ) : null}
              <button className="btn btn--sm" onClick={() => void rename()}>
                名称を変更
              </button>
              {selected.isOpen ? (
                <button className="btn btn--sm btn--primary" onClick={() => setDialog('close')}>
                  スプリントを終了
                </button>
              ) : null}
            </div>
          }
        >
          <dl className="sprint-figures">
            <div>
              <dt>期首残高</dt>
              <dd>{formatYen(selected.openingBalance)}</dd>
            </div>
            <div>
              <dt>収入</dt>
              <dd>{formatYen(selected.income)}</dd>
            </div>
            <div>
              <dt>支出（口座から）</dt>
              <dd>{formatYen(selected.cashOut)}</dd>
            </div>
            <div>
              <dt>収支</dt>
              <dd className={selected.net < 0 ? 'value-bad' : selected.net > 0 ? 'value-good' : ''}>
                {formatYenSigned(selected.net)}
              </dd>
            </div>
            <div>
              <dt>{selected.isOpen ? '現在の残高' : '期末残高'}</dt>
              <dd>{formatYen(selected.closingBalance)}</dd>
            </div>
            <div>
              <dt>未精算の立替</dt>
              <dd className={selected.unsettled > 0 ? 'value-bad' : ''}>
                {formatYen(selected.unsettled)}
              </dd>
            </div>
          </dl>
          {selected.sprint.note ? (
            <p style={{ marginBottom: 0, marginTop: 14, fontSize: 13, color: 'var(--ink-2)' }}>
              {selected.sprint.note}
            </p>
          ) : null}
        </Card>

        {selected.isOpen ? (
          <SettlementPlanCard summary={scoped.summary} closingBalance={selected.closingBalance} />
        ) : null}

        <Card
          title="月ごとの収支"
          subtitle="このスプリント内。支出は口座から実際に出た額（立替は精算した月に計上）"
        >
          <MonthlyBars data={scoped.monthly} />
        </Card>

        <MonthlyTable monthly={scoped.monthly} />

        <SettlementCard summary={scoped.summary} expenses={scoped.expenses} />

        <CategoryBreakdown expenses={scoped.expenses} sprintWindow={scoped.window} />

        <ExpenseTable
          expenses={scoped.expenses}
          sprintWindow={scoped.window}
          defaultMemberId={selfId}
        />

        <IncomeTable incomes={scoped.incomes} defaultMemberId={selfId} />

        <SprintHistory stats={sprintStats} selectedId={selected.sprint.id} onPick={setPickedId} />
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

      {dialog === 'close' && selected.isOpen ? (
        <Modal title="スプリントを終了" onClose={() => setDialog(null)}>
          <CloseSprintForm
            totals={selected}
            onDone={() => {
              setDialog(null)
              // 終了すると新しいスプリントが進行中になるので、そちらを見る
              setPickedId('')
            }}
          />
        </Modal>
      ) : null}
    </>
  )
}

/**
 * スプリントを終わらせるための精算プラン。
 * 「チーム残高がプラス」かつ「全員の負担が均一」に到達するために、
 * 誰にいくら返金し、誰からいくら集めればよいかを1人1行で出す。
 */
function SettlementPlanCard({
  summary,
  closingBalance,
}: {
  summary: Summary
  closingBalance: number
}) {
  // 既定は「使い切って0円にする」。残したい額があれば書き換える
  const [target, setTarget] = useState('0')
  const targetBalance = Math.round(Number(target) || 0)
  const plan = settlementPlan(summary, closingBalance, targetBalance)

  if (plan.members.length === 0) return null

  const spread =
    Math.max(...plan.members.map((m) => m.finalBurden)) -
    Math.min(...plan.members.map((m) => m.finalBurden))

  return (
    <Card
      title="精算プラン"
      subtitle="スプリントを終了するための入金・返金。全員の負担が同じ額に揃います"
      actions={
        <div className="toolbar">
          <label className="settle-target">
            <span>終了時に残すチーム残高</span>
            <input
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
        </div>
      }
      flush
    >
      <div style={{ padding: '14px 18px 0' }}>
        {!plan.targetIsPositive ? (
          <Banner tone="critical">
            <strong>残すチーム残高がマイナスです。</strong>{' '}
            終了条件（残高がプラス）を満たしません。0以上の額を入れてください。
          </Banner>
        ) : (
          <Banner tone="info">
            この通りにやり取りすると、<strong>全員の負担が {formatYen(plan.burdenPerMember)} に揃い</strong>
            、チーム残高は <strong>{formatYen(plan.targetBalance)}</strong> になります。
            立替はすべて精算済みになります。
            {spread > 0 ? '（端数の関係で1円だけ差が出る人がいます）' : ''}
          </Banner>
        )}
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>メンバー</th>
              <th className="num">納入済会費</th>
              <th className="num">立替済</th>
              <th className="num">やり取り</th>
              <th className="num">精算後の負担</th>
            </tr>
          </thead>
          <tbody>
            {plan.members.map((m) => (
              <tr key={m.member.id}>
                <td className="nowrap">{m.member.name}</td>
                <td className="num">{formatYen(m.feesPaid)}</td>
                <td className="num">{m.unsettled > 0 ? formatYen(m.unsettled) : '—'}</td>
                <td className="num">
                  {m.transfer === 0 ? (
                    <span style={{ color: 'var(--ink-muted)' }}>やり取りなし</span>
                  ) : m.transfer > 0 ? (
                    <span className="settle-amount settle-amount--out">
                      {formatYen(m.transfer)} を返金
                    </span>
                  ) : (
                    <span className="settle-amount settle-amount--in">
                      {formatYen(-m.transfer)} を集金
                    </span>
                  )}
                </td>
                <td className="num">{formatYen(m.finalBurden)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>チームから返金する合計</td>
              <td className="num">{formatYen(plan.payOutTotal)}</td>
              <td className="num" />
            </tr>
            <tr>
              <td colSpan={3}>チームが集金する合計</td>
              <td className="num">{formatYen(plan.collectTotal)}</td>
              <td className="num" />
            </tr>
            <tr>
              <td colSpan={3}>精算後のチーム残高</td>
              <td className={`num ${plan.targetBalance < 0 ? 'value-bad' : ''}`}>
                {formatYen(closingBalance - plan.payOutTotal + plan.collectTotal)}
              </td>
              <td className="num" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--ink-muted)' }}>
        「やり取り」は立替の返金と会費の調整を相殺した金額です。1人につき1回の振込で済みます。
        実際に振り込んだら、支出一覧で立替を「精算する」にし、会費の追加・返金を収入／支出として登録してください。
      </div>
    </Card>
  )
}

/** 全スプリントの記録。いつでも過去を振り返れるようにする */
function SprintHistory({
  stats,
  selectedId,
  onPick,
}: {
  stats: SprintTotals[]
  selectedId: string
  onPick: (id: string) => void
}) {
  return (
    <Card title="スプリントの記録" subtitle={`${stats.length}件`} flush>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="col-title">スプリント</th>
              <th>期間</th>
              <th className="num">収入</th>
              <th className="num">支出</th>
              <th className="num">収支</th>
              <th className="num">期末残高</th>
              <th className="num">未精算</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {[...stats].reverse().map((t) => (
              <tr key={t.sprint.id}>
                <td>
                  {sprintLabel(t)}
                  <span className="sub">
                    {t.isOpen ? <Badge tone="good">進行中</Badge> : `${t.incomeCount + t.expenseCount} 件の記録`}
                  </span>
                </td>
                <td className="nowrap">{sprintPeriod(t)}</td>
                <td className="num">{formatYen(t.income)}</td>
                <td className="num">{formatYen(t.cashOut)}</td>
                <td className={`num ${t.net < 0 ? 'value-bad' : t.net > 0 ? 'value-good' : ''}`}>
                  {formatYenSigned(t.net)}
                </td>
                <td className="num">{formatYen(t.closingBalance)}</td>
                <td className={`num ${t.unsettled > 0 ? 'value-bad' : ''}`}>
                  {t.unsettled > 0 ? formatYen(t.unsettled) : '—'}
                </td>
                <td className="col-actions">
                  {t.sprint.id === selectedId ? (
                    <Badge tone="info">表示中</Badge>
                  ) : (
                    <button className="btn btn--ghost btn--sm" onClick={() => onPick(t.sprint.id)}>
                      表示
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** グラフの数値を表でも読めるようにする（色に頼らない経路を必ず残す） */
function MonthlyTable({ monthly }: { monthly: ReturnType<typeof monthlySeries> }) {
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
function SettlementCard({ summary, expenses }: { summary: Summary; expenses: Expense[] }) {
  const { update, reload } = useTeamData()
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

  return (
    <Card title="立替の精算状況" subtitle="このスプリントでチームがメンバーに返すべき金額" flush>
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
            {summary.byMember.map((row) => (
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
function CategoryBreakdown({
  expenses,
  sprintWindow,
}: {
  expenses: Expense[]
  sprintWindow?: DateWindow
}) {
  const rows = useMemo(
    () => byCategory(expenses, (e) => e.category, today(), sprintWindow),
    [expenses, sprintWindow],
  )
  if (rows.length === 0) return null
  const max = rows[0].amount

  return (
    <Card title="費目別の支出" subtitle="このスプリントの発生ベース（未精算の立替も含む）">
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

function ExpenseTable({
  expenses,
  sprintWindow,
  defaultMemberId,
}: {
  expenses: Expense[]
  sprintWindow?: DateWindow
  defaultMemberId: string
}) {
  const { races, members, memberName, update, remove } = useTeamData()
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

  // 固定費は今日までの回数ぶんが発生額。単発は1回分
  // スプリントを選んでいるときは、その期間に入る回数だけを数える
  const factsOf = new Map(filtered.map((e) => [e.id, expenseFacts(e, today(), sprintWindow)]))
  const total = filtered.reduce((sum, e) => sum + (factsOf.get(e.id)?.accrued ?? e.amount), 0)

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
                const facts = factsOf.get(e.id)
                const monthly = e.recurrence === 'monthly'
                return (
                  <tr key={e.id}>
                    <td className="nowrap">
                      {formatDate(e.occurred_on)}
                      {monthly ? (
                        <span className="sub">
                          {e.recurrence_ends_on ? `〜 ${formatDate(e.recurrence_ends_on)}` : '〜 継続中'}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {e.description}
                      {monthly ? (
                        <span className="sub">
                          <Badge tone="warning">固定費 毎月{e.payment_day}日</Badge>
                        </span>
                      ) : null}
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
                    <td className="num">
                      {formatYen(facts?.accrued ?? e.amount)}
                      {monthly ? (
                        <span className="sub" style={{ textAlign: 'right' }}>
                          毎月 {formatYen(e.amount)} × {facts?.count ?? 0}回
                        </span>
                      ) : null}
                    </td>
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

function IncomeTable({ incomes, defaultMemberId }: { incomes: Income[]; defaultMemberId: string }) {
  const { memberName, remove } = useTeamData()
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
