import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { Field } from '../components/ui'
import { today } from '../lib/format'
import { INCOME_CATEGORIES, type Income, type IncomeCategory } from '../lib/types'
import { FormFooter, nullable, optionsFrom, useSubmit } from './formBits'

export function IncomeForm({
  initial,
  defaultMemberId,
  onDone,
}: {
  initial?: Income
  defaultMemberId?: string | null
  onDone: () => void
}) {
  const { members, insert, update, ensureOpenSprint } = useTeamData()

  const [occurredOn, setOccurredOn] = useState(initial?.occurred_on ?? today())
  const [category, setCategory] = useState<IncomeCategory>(initial?.category ?? 'membership_fee')
  const [memberId, setMemberId] = useState(initial?.member_id ?? defaultMemberId ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [note, setNote] = useState(initial?.note ?? '')

  // 会費は誰が納めたかが本質なので必須。スポンサー等は個人に紐付かない
  const needsMember = category === 'membership_fee'

  const { busy, error, handle } = useSubmit(async () => {
    const row = {
      occurred_on: occurredOn,
      category,
      member_id: memberId || null,
      amount: Math.round(Number(amount)),
      note: nullable(note),
    }
    if (!Number.isFinite(row.amount) || row.amount <= 0) throw new Error('金額は1円以上で入力してください')
    if (needsMember && !row.member_id) throw new Error('会費の納入者を選んでください')

    if (initial) {
      await update('incomes', initial.id, row)
    } else {
      // 新規の記録は必ず進行中のスプリントに属させる
      const sprint = await ensureOpenSprint()
      await insert('incomes', { ...row, sprint_id: sprint.id })
    }
  }, onDone)

  return (
    <form onSubmit={handle}>
      <div className="form-grid">
        <Field label="入金日" required>
          <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required />
        </Field>

        <Field label="種別" required>
          <select value={category} onChange={(e) => setCategory(e.target.value as IncomeCategory)}>
            {optionsFrom(INCOME_CATEGORIES)}
          </select>
        </Field>

        <Field
          label="納入者"
          required={needsMember}
          hint={needsMember ? undefined : '個人に紐付かない収入は空欄で構いません'}
        >
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">（指定なし）</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="金額（円）" required>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>

        <Field label="メモ" wide>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 2026年上期分" />
        </Field>
      </div>

      <FormFooter busy={busy} error={error} onCancel={onDone} submitLabel={initial ? '更新' : '登録'} />
    </form>
  )
}
