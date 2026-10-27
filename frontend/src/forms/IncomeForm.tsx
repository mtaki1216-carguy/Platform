import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { Field } from '../components/ui'
import { formatYen, today } from '../lib/format'
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
  const { members, incomes, insert, insertMany, update, ensureOpenSprint } = useTeamData()

  const [occurredOn, setOccurredOn] = useState(initial?.occurred_on ?? today())
  const [category, setCategory] = useState<IncomeCategory>(initial?.category ?? 'membership_fee')
  const [memberId, setMemberId] = useState(initial?.member_id ?? defaultMemberId ?? '')
  // 会費は全員同額なので、新規のときは直近の会費の額を初期値にする
  const latestFee = incomes
    .filter((i) => i.category === 'membership_fee')
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))[0]?.amount
  const [amount, setAmount] = useState(initial ? String(initial.amount) : latestFee ? String(latestFee) : '')
  const [note, setNote] = useState(initial?.note ?? '')

  // 会費の新規登録は、全員分をまとめて入れるのが基本。1人ずつにも切り替えられる
  const [bulk, setBulk] = useState(true)
  const paidInMonth = (memberId: string, date: string) =>
    incomes.some(
      (i) =>
        i.category === 'membership_fee' &&
        i.member_id === memberId &&
        i.occurred_on.slice(0, 7) === date.slice(0, 7),
    )
  // 同じ月に会費を納めている人は、二重に入れないよう最初は外しておく
  const [picked, setPicked] = useState<string[]>(() =>
    members.filter((m) => !paidInMonth(m.id, today())).map((m) => m.id),
  )

  // 会費は誰が納めたかが本質なので必須。部品売却やスポンサーは個人に紐付かない
  const needsMember = category === 'membership_fee'
  const bulkMode = !initial && needsMember && bulk
  const perHead = Math.round(Number(amount))
  const bulkTotal = Number.isFinite(perHead) && perHead > 0 ? perHead * picked.length : 0

  // 何を書けばいいかが分かる例を種別ごとに出す
  const notePlaceholder =
    category === 'parts_sale'
      ? '例: 旧ホイール4本'
      : category === 'membership_fee'
        ? '例: 2026年上期分'
        : '例: 何の入金か'

  const { busy, error, handle } = useSubmit(async () => {
    if (bulkMode) {
      if (!Number.isFinite(perHead) || perHead <= 0) throw new Error('金額は1円以上で入力してください')
      if (picked.length === 0) throw new Error('会費を納めた人を1人以上選んでください')
      const sprint = await ensureOpenSprint()
      await insertMany(
        'incomes',
        members
          .filter((m) => picked.includes(m.id))
          .map((m) => ({
            sprint_id: sprint.id,
            occurred_on: occurredOn,
            category,
            member_id: m.id,
            amount: perHead,
            note: nullable(note),
          })),
      )
      return
    }

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

        {!initial && needsMember ? (
          <Field label="入力方法" wide>
            <div className="radio-row">
              <label className="radio-chip">
                <input type="radio" name="income-mode" checked={bulk} onChange={() => setBulk(true)} />
                全員分をまとめて登録
              </label>
              <label className="radio-chip">
                <input type="radio" name="income-mode" checked={!bulk} onChange={() => setBulk(false)} />
                1人ずつ登録
              </label>
            </div>
          </Field>
        ) : null}

        {bulkMode ? null : (
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
        )}

        <Field
          label={bulkMode ? '1人あたりの金額（円）' : '金額（円）'}
          required
          hint={bulkMode && latestFee ? `直近の会費（${formatYen(latestFee)}）を入れています` : undefined}
        >
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

        {/* Field は <label> なので、複数のチェックを入れると余白のクリックで先頭が切り替わる。div で組む */}
        {bulkMode ? (
          <div className="field field--wide" role="group" aria-labelledby="fee-members-label">
            <span id="fee-members-label">
              会費を納めた人<span className="field__req">*</span>
            </span>
            <div className="radio-row">
              {members.map((m) => {
                const paid = paidInMonth(m.id, occurredOn)
                return (
                  <label key={m.id} className="radio-chip">
                    <input
                      type="checkbox"
                      checked={picked.includes(m.id)}
                      onChange={(e) =>
                        setPicked((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)))
                      }
                    />
                    {m.name}
                    {paid ? <span className="chip-amount">この月は納入済み</span> : null}
                  </label>
                )
              })}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setPicked(picked.length === members.length ? [] : members.map((m) => m.id))}
              >
                {picked.length === members.length ? '全員を外す' : '全員を選ぶ'}
              </button>
            </div>
            <span className="field__hint">
              {picked.length}人 × {formatYen(Number.isFinite(perHead) && perHead > 0 ? perHead : 0)} ＝{' '}
              <b className="num">{formatYen(bulkTotal)}</b>
              ・同じ月に納入済みの人は最初は外れています
            </span>
          </div>
        ) : null}

        <Field label="メモ" wide>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={notePlaceholder}
          />
        </Field>
      </div>

      <FormFooter busy={busy} error={error} onCancel={onDone} submitLabel={initial ? '更新' : bulkMode ? `${picked.length}人分を登録` : '登録'} />
    </form>
  )
}
