import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { Field } from '../components/ui'
import { formatDateRange, formatYen, today } from '../lib/format'
import { splitEvenly } from '../lib/finance'
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
  const { members, races, insert, update, ensureOpenSprint, createSharedExpense, sharedAvailable } =
    useTeamData()

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

  // 割り勘：対象メンバーを限定して、立替者に返す金額を人数で均等に割る
  const [limitMembers, setLimitMembers] = useState(false)
  const [splitIds, setSplitIds] = useState<string[]>(() => members.map((m) => m.id))

  const isAdvance = payerType === 'member'
  const isMonthly = recurrence === 'monthly'
  // 割り勘は新規の単発の立替だけ。整備記録に紐づく費用は紐付けが切れるので対象外
  const splitOffered = !initial && isAdvance && !isMonthly && !preset?.maintenanceId
  const splitting = splitOffered && sharedAvailable && limitMembers

  const splitAmount = Math.round(Number(amount))
  const splitRows =
    splitting && Number.isFinite(splitAmount) && splitAmount > 0
      ? splitEvenly(
          splitAmount,
          members.filter((m) => splitIds.includes(m.id)).map((m) => m.id),
          paidBy || null,
        )
      : []
  const shareOf = (id: string) => splitRows.find((r) => r.memberId === id)?.amount

  function toggleSplitMember(id: string, on: boolean) {
    setSplitIds((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  const { busy, error, handle } = useSubmit(async () => {
    const value = Math.round(Number(amount))
    if (!Number.isFinite(value) || value <= 0) throw new Error('金額は1円以上で入力してください')
    if (!description.trim()) throw new Error('内容を入力してください')
    if (isAdvance && !paidBy) throw new Error('立替の場合は立替者を選んでください')

    if (splitting) {
      if (!splitIds.some((id) => id !== paidBy)) {
        throw new Error('立替者のほかに、割り勘の対象メンバーを1人以上選んでください')
      }
      const shares = splitEvenly(
        value,
        members.filter((m) => splitIds.includes(m.id)).map((m) => m.id),
        paidBy,
      ).map((r) => ({
        member_id: r.memberId,
        amount: r.amount,
        // 立替者本人の分は、自分に返す必要がないので最初から返済済み
        settled: r.memberId === paidBy,
      }))
      await createSharedExpense(
        {
          occurred_on: occurredOn,
          category,
          description: description.trim(),
          amount: value,
          paid_by: paidBy,
          race_id: raceId || null,
          note: nullable(note),
        },
        shares,
      )
      await onSaved?.()
      return
    }

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

            {splitting ? null : (
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
            )}

            {reimbursed && !splitting ? (
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

        {splitOffered ? (
          <>
            <Field
              label="割り勘"
              wide
              hint={
                sharedAvailable
                  ? '立替者以外の対象メンバーが、立替者に均等に返します。チーム口座は通らず、チーム残高にも含まれません'
                  : '割り勘を使うには、データベースに supabase/migrations/0005_shared_expenses.sql を実行してください'
              }
            >
              <div className="checkbox-row">
                <input
                  id="limit-members"
                  type="checkbox"
                  checked={limitMembers && sharedAvailable}
                  disabled={!sharedAvailable}
                  onChange={(e) => setLimitMembers(e.target.checked)}
                />
                <label htmlFor="limit-members">メンバーを限定して登録する</label>
              </div>
            </Field>

            {/* Field は <label> なので、複数のチェックを入れると余白のクリックで先頭が切り替わる。div で組む */}
            {splitting ? (
              <div className="field field--wide" role="group" aria-labelledby="split-members-label">
                <span id="split-members-label">
                  割り勘の対象メンバー<span className="field__req">*</span>
                </span>
                <div className="radio-row">
                  {members.map((m) => {
                    const checked = splitIds.includes(m.id)
                    const share = shareOf(m.id)
                    return (
                      <label key={m.id} className="radio-chip">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleSplitMember(m.id, e.target.checked)}
                        />
                        {m.name}
                        {checked && share !== undefined ? (
                          <span className="chip-amount">
                            {formatYen(share)}
                            {m.id === paidBy ? '（立替者）' : ''}
                          </span>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
              </div>
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

      <FormFooter busy={busy} error={error} onCancel={onDone} submitLabel={initial ? '更新' : splitting ? '割り勘で登録' : '登録'} />
    </form>
  )
}
