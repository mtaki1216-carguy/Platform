import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { Field } from '../components/ui'
import { formatDateRange, today } from '../lib/format'
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type PayerType,
  type Recurrence,
} from '../lib/types'
import { FormFooter, nullable, optionsFrom, useSubmit } from './formBits'

/** 新規登録の初期値。他の画面から「この内容で支出を起こす」ときに使う */
export interface ExpensePreset {
  category?: ExpenseCategory
  description?: string
  amount?: number
  raceId?: string
  maintenanceId?: string
}

export function ExpenseForm({
  initial,
  defaultMemberId,
  preset,
  onSaved,
  onDone,
}: {
  initial?: Expense
  defaultMemberId?: string | null
  preset?: ExpensePreset
  /** 保存が成功した直後に走る追加処理（例: レースの「支払済」フラグを立てる） */
  onSaved?: () => Promise<void> | void
  onDone: () => void
}) {
  const { members, races, insert, update, ensureOpenSprint } = useTeamData()

  const [occurredOn, setOccurredOn] = useState(initial?.occurred_on ?? today())
  const [category, setCategory] = useState<ExpenseCategory>(
    initial?.category ?? preset?.category ?? 'parts',
  )
  const [description, setDescription] = useState(initial?.description ?? preset?.description ?? '')
  const [amount, setAmount] = useState(
    initial ? String(initial.amount) : preset?.amount ? String(preset.amount) : '',
  )
  const [payerType, setPayerType] = useState<PayerType>(initial?.payer_type ?? 'team')
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? defaultMemberId ?? '')
  const [reimbursed, setReimbursed] = useState(initial?.reimbursed ?? false)
  const [reimbursedOn, setReimbursedOn] = useState(initial?.reimbursed_on ?? today())
  const [raceId, setRaceId] = useState(initial?.race_id ?? preset?.raceId ?? '')
  const [note, setNote] = useState(initial?.note ?? '')

  // 固定費は「毎月何日に払うか」だけが単発と違う（＋止めるための終了日）
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? 'once')
  const [paymentDay, setPaymentDay] = useState(
    initial?.payment_day != null ? String(initial.payment_day) : '',
  )
  const [endsOn, setEndsOn] = useState(initial?.recurrence_ends_on ?? '')

  const isAdvance = payerType === 'member'
  const isMonthly = recurrence === 'monthly'

  const { busy, error, handle } = useSubmit(async () => {
    const value = Math.round(Number(amount))
    if (!Number.isFinite(value) || value <= 0) throw new Error('金額は1円以上で入力してください')
    if (!description.trim()) throw new Error('内容を入力してください')
    if (isAdvance && !paidBy) throw new Error('立替の場合は立替者を選んでください')

    let day: number | null = null
    if (isMonthly) {
      day = Math.round(Number(paymentDay))
      if (!Number.isFinite(day) || day < 1 || day > 31) {
        throw new Error('毎月の支払日は1〜31で入力してください')
      }
      if (endsOn && endsOn < occurredOn) throw new Error('終了日は開始日以降にしてください')
    }

    const row = {
      occurred_on: occurredOn,
      category,
      description: description.trim(),
      amount: value,
      payer_type: payerType,
      // チーム口座払いには立替者も精算も存在しない（DB 側の制約と揃える）
      paid_by: isAdvance ? paidBy : null,
      reimbursed: isAdvance ? reimbursed : false,
      reimbursed_on: isAdvance && reimbursed ? reimbursedOn : null,
      race_id: raceId || null,
      maintenance_id: initial?.maintenance_id ?? preset?.maintenanceId ?? null,
      note: nullable(note),
      // 単発に支払日・終了日は入らない（DB 側の制約と揃える）
      recurrence,
      payment_day: isMonthly ? day : null,
      recurrence_ends_on: isMonthly ? nullable(endsOn) : null,
    }

    if (initial) {
      await update('expenses', initial.id, row)
    } else {
      // 新規の記録は必ず進行中のスプリントに属させる
      const sprint = await ensureOpenSprint()
      await insert('expenses', { ...row, sprint_id: sprint.id })
    }

    await onSaved?.()
  }, onDone)

  return (
    <form onSubmit={handle}>
      <div className="form-grid">
        <Field label="支出の種類" required wide>
          <div className="radio-row">
            <label className="radio-chip">
              <input
                type="radio"
                name="recurrence"
                checked={recurrence === 'once'}
                onChange={() => setRecurrence('once')}
              />
              単発
            </label>
            <label className="radio-chip">
              <input
                type="radio"
                name="recurrence"
                checked={isMonthly}
                onChange={() => setRecurrence('monthly')}
              />
              固定費（毎月）
            </label>
          </div>
        </Field>

        <Field
          label={isMonthly ? '開始日' : '支払日'}
          required
          hint={isMonthly ? 'この日以降の支払日から計上します' : undefined}
        >
          <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required />
        </Field>

        {isMonthly ? (
          <>
            <Field
              label="毎月の支払日"
              required
              hint="31日など、その月に無い日は月末に丸めて計上します"
            >
              <input
                type="number"
                min={1}
                max={31}
                step={1}
                inputMode="numeric"
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value)}
                placeholder="例: 25"
                required
              />
            </Field>

            <Field label="終了日" hint="空欄なら継続中。止めたらこの日を入れます">
              <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </Field>
          </>
        ) : null}

        <Field label="費目" required>
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {optionsFrom(EXPENSE_CATEGORIES)}
          </select>
        </Field>

        <Field label={isMonthly ? '毎月の金額（円）' : '金額（円）'} required>
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

        <Field label="内容" required wide>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例: フロントブレーキパッド（前後セット）"
            required
          />
        </Field>

        <Field label="支払元" required wide hint="立替は、精算するまでチーム残高から引かれません">
          <div className="radio-row">
            <label className="radio-chip">
              <input
                type="radio"
                name="payer"
                checked={payerType === 'team'}
                onChange={() => setPayerType('team')}
              />
              チーム口座
            </label>
            <label className="radio-chip">
              <input
                type="radio"
                name="payer"
                checked={payerType === 'member'}
                onChange={() => setPayerType('member')}
              />
              個人立替
            </label>
          </div>
        </Field>

        {isAdvance ? (
          <>
            <Field label="立替者" required>
              <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} required>
                <option value="">選択してください</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="精算状況">
              <div className="checkbox-row" style={{ paddingTop: 7 }}>
                <input
                  id="reimbursed"
                  type="checkbox"
                  checked={reimbursed}
                  onChange={(e) => setReimbursed(e.target.checked)}
                />
                <label htmlFor="reimbursed">精算済み（本人に返金した）</label>
              </div>
            </Field>

            {reimbursed ? (
              <Field label="精算日" required>
                <input
                  type="date"
                  value={reimbursedOn}
                  onChange={(e) => setReimbursedOn(e.target.value)}
                  required
                />
              </Field>
            ) : null}
          </>
        ) : null}

        <Field label="関連レース" hint="レースごとの費用集計に使われます">
          <select value={raceId} onChange={(e) => setRaceId(e.target.value)}>
            <option value="">（なし）</option>
            {races.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}（{formatDateRange(r.starts_on, r.ends_on)}）
              </option>
            ))}
          </select>
        </Field>

        <Field label="メモ" wide>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <FormFooter busy={busy} error={error} onCancel={onDone} submitLabel={initial ? '更新' : '登録'} />
    </form>
  )
}
