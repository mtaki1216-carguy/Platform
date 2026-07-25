import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { Banner, Field } from '../components/ui'
import { formatDate, formatYen, formatYenSigned, today } from '../lib/format'
import type { SprintTotals } from '../lib/finance'
import { FormFooter, nullable, useSubmit } from './formBits'

/**
 * スプリントを終了し、続けて次のスプリントを開始する。
 * 未精算の立替が残っていても止めない（終わらせるかはチームの判断）が、
 * 残高の意味が変わるので必ず警告を出す。
 */
export function CloseSprintForm({ totals, onDone }: { totals: SprintTotals; onDone: () => void }) {
  const { closeSprint } = useTeamData()
  const [name, setName] = useState(totals.sprint.name ?? '')
  const [endedOn, setEndedOn] = useState(today())
  const [note, setNote] = useState(totals.sprint.note ?? '')

  const { busy, error, handle } = useSubmit(
    () => closeSprint({ name: nullable(name), ended_on: endedOn, note: nullable(note) }),
    onDone,
  )

  return (
    <form onSubmit={handle}>
      {totals.unsettled > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="warning">
            <strong>未精算の立替が {formatYen(totals.unsettled)} 残っています。</strong>
            <br />
            このまま終了すると、精算はまだ済んでいないのにスプリントが締まります。返金してから終了するのが
            おすすめですが、そのまま終了しても記録は失われません（未精算のままとして残ります）。
          </Banner>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info">
            未精算の立替はありません。このスプリントの精算はすべて完了しています。
          </Banner>
        </div>
      )}

      <dl className="close-summary">
        <Row label="期首残高" value={formatYen(totals.openingBalance)} />
        <Row label="収入" value={formatYen(totals.income)} />
        <Row label="支出（口座から出た額）" value={formatYen(totals.cashOut)} />
        <Row
          label="収支"
          value={formatYenSigned(totals.net)}
          tone={totals.net < 0 ? 'bad' : totals.net > 0 ? 'good' : undefined}
        />
        <Row label="期末残高" value={formatYen(totals.closingBalance)} strong />
      </dl>

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
          hint={`開始日は ${formatDate(totals.sprint.started_on)}。次のスプリントはこの日から始まります`}
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
        submitLabel="終了して次のスプリントを開始"
      />
    </form>
  )
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
  strong?: boolean
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd
        className={
          (strong ? 'is-strong ' : '') +
          (tone === 'good' ? 'value-good' : tone === 'bad' ? 'value-bad' : '')
        }
      >
        {value}
      </dd>
    </>
  )
}
