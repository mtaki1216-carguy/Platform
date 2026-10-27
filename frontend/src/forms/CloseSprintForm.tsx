import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { Badge, Banner, Field } from '../components/ui'
import { formatDate, formatYen, today } from '../lib/format'
import { closingSettlement, type SprintTotals } from '../lib/finance'
import { FormFooter, nullable, useSubmit } from './formBits'

/**
 * 精算して締める。確認画面で「誰がいくら受け取り／払うか」を見せ、
 * 確定すると立替と割り勘をすべて精算済みにして、次のスプリントを始める。
 * 計算の考え方は lib/finance.ts の closingSettlement を参照。
 */
export function CloseSprintForm({ totals, onDone }: { totals: SprintTotals; onDone: () => void }) {
  const { summary, sharedExpenses, shares, settleAndClose } = useTeamData()
  const settlement = closingSettlement(summary, sharedExpenses, shares)

  const [name, setName] = useState(totals.sprint.name ?? '')
  const [endedOn, setEndedOn] = useState(today())
  const [note, setNote] = useState(totals.sprint.note ?? '')

  const { busy, error, handle } = useSubmit(
    () =>
      settleAndClose({
        name: nullable(name),
        ended_on: endedOn,
        note: nullable(note),
        settlement,
      }),
    onDone,
  )

  const nothingToSettle =
    settlement.unsettledTotal === 0 && settlement.shortfall === 0 && settlement.sharedTotal === 0
  const showShared = settlement.sharedTotal > 0
  const perHead = settlement.rows.length > 0 ? Math.ceil(settlement.shortfall / settlement.rows.length) : 0

  return (
    <form onSubmit={handle}>
      {/* 口座残高 − 未精算の立替 = 実質残高。この1本の式がすべての出発点 */}
      <dl className="close-equation">
        <div>
          <dt>口座残高</dt>
          <dd>{formatYen(settlement.accountBalance)}</dd>
        </div>
        <div>
          <dt>未精算の立替</dt>
          <dd>
            <span className="close-equation__op" aria-hidden="true">
              −
            </span>
            {formatYen(settlement.unsettledTotal)}
          </dd>
        </div>
        <div className="is-result">
          <dt>実質残高</dt>
          <dd className={settlement.netBalance < 0 ? 'value-bad' : undefined}>
            <span className="close-equation__op" aria-hidden="true">
              =
            </span>
            {formatYen(settlement.netBalance)}
          </dd>
        </div>
      </dl>

      <div style={{ margin: '16px 0' }}>
        {nothingToSettle ? (
          <Banner tone="info">精算するものはありません。そのままスプリントを終了できます。</Banner>
        ) : settlement.shortfall > 0 ? (
          <Banner tone="warning">
            <strong>実質残高が {formatYen(settlement.shortfall)} 足りません。</strong>
            不足ぶんを全員で均等に集めます（1人 {formatYen(perHead)} 前後）。集めた額は収入（その他・精算の追加徴収）として記録されます。
          </Banner>
        ) : (
          <Banner tone="info">
            不足はありません。立替を全額返しても、口座に <strong>{formatYen(settlement.balanceAfter)}</strong> 残ります。
          </Banner>
        )}
      </div>

      {nothingToSettle ? null : (
        <>
          <div className="table-scroll close-table">
            <table>
              <thead>
                <tr>
                  <th>メンバー</th>
                  <th className="num">立替の返金</th>
                  <th className="num">追加徴収</th>
                  {showShared ? <th className="num">割り勘</th> : null}
                  <th className="num">やり取り</th>
                </tr>
              </thead>
              <tbody>
                {settlement.rows.map((r) => (
                  <tr key={r.member.id}>
                    <td className="nowrap">{r.member.name}</td>
                    <td className="num">{r.advance > 0 ? `+${formatYen(r.advance)}` : '—'}</td>
                    <td className="num">{r.collect > 0 ? `−${formatYen(r.collect)}` : '—'}</td>
                    {showShared ? (
                      <td className="num">
                        {r.sharedNet === 0 ? '—' : `${r.sharedNet > 0 ? '+' : '−'}${formatYen(Math.abs(r.sharedNet))}`}
                      </td>
                    ) : null}
                    <td className="num">
                      {r.transfer === 0 ? (
                        <span style={{ color: 'var(--ink-muted)' }}>なし</span>
                      ) : r.transfer > 0 ? (
                        <span className="settle-amount settle-amount--out">{formatYen(r.transfer)} 受け取る</span>
                      ) : (
                        <span className="settle-amount settle-amount--in">{formatYen(-r.transfer)} 払う</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={showShared ? 4 : 3}>チーム口座から出る合計</td>
                  <td className="num">{formatYen(settlement.payOutTotal)}</td>
                </tr>
                <tr>
                  <td colSpan={showShared ? 4 : 3}>チーム口座に入る合計</td>
                  <td className="num">{formatYen(settlement.collectTotal)}</td>
                </tr>
                <tr>
                  <td colSpan={showShared ? 4 : 3}>精算後の口座残高</td>
                  <td className="num">{formatYen(settlement.balanceAfter)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="close-note">
            「やり取り」は1人につき1回の振込です。
            {showShared ? (
              <>
                <Badge tone="neutral">割り勘</Badge>
                の貸し借りも含めて、全員がチーム口座とだけやり取りすれば精算が終わります。
              </>
            ) : null}
            確定すると、立替{showShared ? 'と割り勘' : ''}はすべて精算済みになります。実際の振込は確定の前後どちらでも構いません。
          </p>
        </>
      )}

      <div className="form-grid" style={{ marginTop: 18 }}>
        <Field
          label="スプリント名"
          wide
          hint="後から変更できます。空欄なら「第Nスプリント」として表示されます"
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 2026年 前半戦"
          />
        </Field>

        <Field
          label="終了日"
          required
          hint={`開始日は ${formatDate(totals.sprint.started_on)}。精算日と次のスプリントの開始日になります`}
        >
          <input type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} required />
        </Field>

        <Field label="メモ" wide>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="このスプリントの振り返り、次に向けた申し送りなど"
          />
        </Field>
      </div>

      <FormFooter
        busy={busy}
        error={error}
        onCancel={onDone}
        submitLabel={nothingToSettle ? '終了して次のスプリントを開始' : '精算して次のスプリントを開始'}
      />
    </form>
  )
}
