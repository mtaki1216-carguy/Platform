import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { Field } from '../components/ui'
import { formatDateRange, today } from '../lib/format'
import {
  MAINTENANCE_CATEGORIES,
  type MaintenanceCategory,
  type MaintenanceRecord,
  type PayerType,
} from '../lib/types'
import { FormFooter, nullable, nullableInt, optionsFrom, useSubmit } from './formBits'

export function MaintenanceForm({
  initial,
  defaultMemberId,
  onDone,
}: {
  initial?: MaintenanceRecord
  defaultMemberId?: string | null
  onDone: () => void
}) {
  const { members, races, maintenance, insert, update } = useTeamData()

  const [performedOn, setPerformedOn] = useState(initial?.performed_on ?? today())
  const [category, setCategory] = useState<MaintenanceCategory>(initial?.category ?? 'other')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [odometer, setOdometer] = useState(initial?.odometer_km != null ? String(initial.odometer_km) : '')
  const [performedBy, setPerformedBy] = useState(initial?.performed_by ?? defaultMemberId ?? '')
  const [shop, setShop] = useState(initial?.shop ?? '')
  const [detail, setDetail] = useState(initial?.detail ?? '')
  const [nextDueOn, setNextDueOn] = useState(initial?.next_due_on ?? '')
  const [nextDueKm, setNextDueKm] = useState(initial?.next_due_km != null ? String(initial.next_due_km) : '')
  const [raceId, setRaceId] = useState(initial?.race_id ?? '')

  // 費用は expenses に入れる（整備記録側に金額を持たせると二重計上になる）。
  // 新規登録のときだけ、その場で支出も一緒に作れるようにする。
  const [withCost, setWithCost] = useState(false)
  const [cost, setCost] = useState('')
  const [costPayer, setCostPayer] = useState<PayerType>('team')
  const [costPaidBy, setCostPaidBy] = useState(defaultMemberId ?? '')

  // 直近の走行距離を初期入力の目安として出す
  const lastOdometer = maintenance
    .filter((m) => m.odometer_km != null && m.id !== initial?.id)
    .sort((a, b) => b.performed_on.localeCompare(a.performed_on))[0]?.odometer_km

  const { busy, error, handle } = useSubmit(async () => {
    if (!title.trim()) throw new Error('整備内容を入力してください')

    const row = {
      performed_on: performedOn,
      category,
      title: title.trim(),
      odometer_km: nullableInt(odometer),
      performed_by: performedBy || null,
      shop: nullable(shop),
      detail: nullable(detail),
      next_due_on: nullable(nextDueOn),
      next_due_km: nullableInt(nextDueKm),
      race_id: raceId || null,
    }

    if (initial) {
      await update('maintenance_records', initial.id, row)
      return
    }

    const created = await insert<MaintenanceRecord>('maintenance_records', row)

    if (withCost) {
      const value = Math.round(Number(cost))
      if (!Number.isFinite(value) || value <= 0) throw new Error('費用は1円以上で入力してください')
      if (costPayer === 'member' && !costPaidBy) throw new Error('立替の場合は立替者を選んでください')
      await insert('expenses', {
        occurred_on: performedOn,
        category: 'maintenance',
        description: title.trim(),
        amount: value,
        payer_type: costPayer,
        paid_by: costPayer === 'member' ? costPaidBy : null,
        reimbursed: false,
        reimbursed_on: null,
        race_id: raceId || null,
        maintenance_id: created.id,
        note: null,
      })
    }
  }, onDone)

  return (
    <form onSubmit={handle}>
      <div className="form-grid">
        <Field label="実施日" required>
          <input type="date" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} required />
        </Field>

        <Field label="区分" required>
          <select value={category} onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}>
            {optionsFrom(MAINTENANCE_CATEGORIES)}
          </select>
        </Field>

        <Field
          label="走行距離（km）"
          hint={lastOdometer != null ? `前回の記録は ${lastOdometer.toLocaleString('ja-JP')} km` : undefined}
        >
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
          />
        </Field>

        <Field label="整備内容" required wide>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: エンジンオイル・オイルフィルター交換"
            required
          />
        </Field>

        <Field label="作業者">
          <select value={performedBy} onChange={(e) => setPerformedBy(e.target.value)}>
            <option value="">（未設定）</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="作業場所 / ショップ">
          <input type="text" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="例: 自宅ガレージ" />
        </Field>

        <Field label="関連レース" hint="レース前整備・レース後点検などの紐付けに">
          <select value={raceId} onChange={(e) => setRaceId(e.target.value)}>
            <option value="">（なし）</option>
            {races.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}（{formatDateRange(r.starts_on, r.ends_on)}）
              </option>
            ))}
          </select>
        </Field>

        <Field label="詳細・使用部品" wide>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="部品番号、締付トルク、気付いた点など"
          />
        </Field>

        <Field label="次回交換の目安（日付）">
          <input type="date" value={nextDueOn} onChange={(e) => setNextDueOn(e.target.value)} />
        </Field>

        <Field label="次回交換の目安（km）">
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={nextDueKm}
            onChange={(e) => setNextDueKm(e.target.value)}
          />
        </Field>
      </div>

      {!initial ? (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div className="checkbox-row">
            <input
              id="with-cost"
              type="checkbox"
              checked={withCost}
              onChange={(e) => setWithCost(e.target.checked)}
            />
            <label htmlFor="with-cost">この整備の費用も支出として登録する</label>
          </div>

          {withCost ? (
            <div className="form-grid" style={{ marginTop: 14 }}>
              <Field label="費用（円）" required>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </Field>

              <Field label="支払元" required>
                <div className="radio-row">
                  <label className="radio-chip">
                    <input
                      type="radio"
                      name="cost-payer"
                      checked={costPayer === 'team'}
                      onChange={() => setCostPayer('team')}
                    />
                    チーム口座
                  </label>
                  <label className="radio-chip">
                    <input
                      type="radio"
                      name="cost-payer"
                      checked={costPayer === 'member'}
                      onChange={() => setCostPayer('member')}
                    />
                    個人立替
                  </label>
                </div>
              </Field>

              {costPayer === 'member' ? (
                <Field label="立替者" required>
                  <select value={costPaidBy} onChange={(e) => setCostPaidBy(e.target.value)}>
                    <option value="">選択してください</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <FormFooter busy={busy} error={error} onCancel={onDone} submitLabel={initial ? '更新' : '登録'} />
    </form>
  )
}
