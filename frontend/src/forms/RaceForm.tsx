import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { Field } from '../components/ui'
import { RACE_STATUSES, type Race, type RaceStatus } from '../lib/types'
import { FormFooter, nullable, optionsFrom, useSubmit } from './formBits'

export function RaceForm({ initial, onDone }: { initial?: Race; onDone: () => void }) {
  const { insert, update } = useTeamData()

  const [name, setName] = useState(initial?.name ?? '')
  const [circuit, setCircuit] = useState(initial?.circuit ?? '')
  const [startsOn, setStartsOn] = useState(initial?.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? '')
  const [entryFee, setEntryFee] = useState(initial ? String(initial.entry_fee) : '')
  const [entryOpensOn, setEntryOpensOn] = useState(initial?.entry_opens_on ?? '')
  const [entryDeadline, setEntryDeadline] = useState(initial?.entry_deadline ?? '')
  const [appliedOn, setAppliedOn] = useState(initial?.applied_on ?? '')
  const [status, setStatus] = useState<RaceStatus>(initial?.status ?? 'considering')
  const [feePaid, setFeePaid] = useState(initial?.fee_paid ?? false)
  const [url, setUrl] = useState(initial?.url ?? '')
  const [note, setNote] = useState(initial?.note ?? '')

  const { busy, error, handle } = useSubmit(async () => {
    if (!name.trim()) throw new Error('レース名を入力してください')
    if (!startsOn) throw new Error('開催日を入力してください')
    if (endsOn && endsOn < startsOn) throw new Error('最終日は開催日以降にしてください')
    if (entryOpensOn && entryDeadline && entryDeadline < entryOpensOn) {
      throw new Error('申込締切は申込開始日以降にしてください')
    }

    const fee = entryFee.trim() === '' ? 0 : Math.round(Number(entryFee))
    if (!Number.isFinite(fee) || fee < 0) throw new Error('参加費は0円以上で入力してください')

    const row = {
      name: name.trim(),
      circuit: nullable(circuit),
      starts_on: startsOn,
      ends_on: nullable(endsOn),
      entry_fee: fee,
      entry_opens_on: nullable(entryOpensOn),
      entry_deadline: nullable(entryDeadline),
      applied_on: nullable(appliedOn),
      status,
      fee_paid: feePaid,
      url: nullable(url),
      note: nullable(note),
    }

    if (initial) await update('races', initial.id, row)
    else await insert('races', row)
  }, onDone)

  return (
    <form onSubmit={handle}>
      <div className="form-grid">
        <Field label="レース名" required wide>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: スーパー耐久 第3戦"
            required
          />
        </Field>

        <Field label="サーキット">
          <input
            type="text"
            value={circuit}
            onChange={(e) => setCircuit(e.target.value)}
            placeholder="例: 富士スピードウェイ"
          />
        </Field>

        <Field label="申込状況" required>
          <select value={status} onChange={(e) => setStatus(e.target.value as RaceStatus)}>
            {optionsFrom(RACE_STATUSES)}
          </select>
        </Field>

        <Field label="開催日（決勝／初日）" required>
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
        </Field>

        <Field label="最終日" hint="単日開催なら空欄">
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </Field>

        <Field label="申込開始日">
          <input type="date" value={entryOpensOn} onChange={(e) => setEntryOpensOn(e.target.value)} />
        </Field>

        <Field label="申込締切日" hint="締切が近づくと一覧で警告が出ます">
          <input type="date" value={entryDeadline} onChange={(e) => setEntryDeadline(e.target.value)} />
        </Field>

        <Field label="申込日" hint="実際に申し込んだ日">
          <input type="date" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
        </Field>

        <Field label="参加費（円）">
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value)}
          />
        </Field>

        <Field label="参加費の支払い">
          <div className="checkbox-row" style={{ paddingTop: 7 }}>
            <input
              id="fee-paid"
              type="checkbox"
              checked={feePaid}
              onChange={(e) => setFeePaid(e.target.checked)}
            />
            <label htmlFor="fee-paid">支払い済み</label>
          </div>
        </Field>

        <Field label="大会公式ページ" wide>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Field label="メモ" wide>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="レギュレーション、必要書類、宿の手配など"
          />
        </Field>
      </div>

      <FormFooter busy={busy} error={error} onCancel={onDone} submitLabel={initial ? '更新' : '登録'} />
    </form>
  )
}
