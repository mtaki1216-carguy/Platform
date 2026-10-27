import { useState } from 'react'
import { useTeamData } from '../data/DataProvider'
import { FormFooter, nullable, useSubmit } from '../forms/formBits'
import { formatDate } from '../lib/format'
import { Banner, Card, Field, Modal } from './ui'

/**
 * 車両の現在の状態。いまはタイヤ（フロント／リア）と、その他のメモ。
 * 書式は縛らず、書いたとおりに表示する（例: 195/55/15）。
 */
export function VehicleStatusCard() {
  const { vehicleStatus, vehicleAvailable } = useTeamData()
  const [editing, setEditing] = useState(false)

  const updated = vehicleStatus?.updated_at ? formatDate(vehicleStatus.updated_at.slice(0, 10)) : null
  const hasAny = Boolean(vehicleStatus?.tire_front || vehicleStatus?.tire_rear || vehicleStatus?.note)

  return (
    <>
      <Card
        title="車両の状態"
        subtitle={hasAny && updated ? `いまの装着状態・${updated} 更新` : 'いまの装着状態'}
        actions={
          <button className="btn btn--sm" onClick={() => setEditing(true)} disabled={!vehicleAvailable}>
            編集
          </button>
        }
      >
        {vehicleAvailable ? null : (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="info">
              車両の状態を保存するには、データベースに <code>supabase/migrations/0006_vehicle_status.sql</code>{' '}
              を実行してください。
            </Banner>
          </div>
        )}

        <dl className="spec-grid">
          <Spec label="フロントタイヤ" value={vehicleStatus?.tire_front} />
          <Spec label="リアタイヤ" value={vehicleStatus?.tire_rear} />
        </dl>

        {vehicleStatus?.note ? <p className="spec-note">{vehicleStatus.note}</p> : null}
      </Card>

      {editing ? (
        <Modal title="車両の状態を編集" onClose={() => setEditing(false)}>
          <VehicleStatusForm onDone={() => setEditing(false)} />
        </Modal>
      ) : null}
    </>
  )
}

function Spec({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="spec">
      <dt>{label}</dt>
      <dd className={value ? undefined : 'is-empty'}>{value || '未設定'}</dd>
    </div>
  )
}

function VehicleStatusForm({ onDone }: { onDone: () => void }) {
  const { vehicleStatus, saveVehicleStatus } = useTeamData()
  const [front, setFront] = useState(vehicleStatus?.tire_front ?? '')
  const [rear, setRear] = useState(vehicleStatus?.tire_rear ?? '')
  const [note, setNote] = useState(vehicleStatus?.note ?? '')

  const { busy, error, handle } = useSubmit(
    () =>
      saveVehicleStatus({
        tire_front: nullable(front),
        tire_rear: nullable(rear),
        note: nullable(note),
      }),
    onDone,
  )

  return (
    <form onSubmit={handle}>
      <div className="form-grid">
        <Field label="フロントタイヤ" hint="書いたとおりに表示します">
          <input
            type="text"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="例: 195/55/15"
            autoFocus
          />
        </Field>
        <Field label="リアタイヤ">
          <input type="text" value={rear} onChange={(e) => setRear(e.target.value)} placeholder="例: 185/60/15" />
        </Field>
        <Field label="メモ" wide hint="タイヤ以外の状態（ホイール、ブレーキパッド、気になっていることなど）">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <FormFooter busy={busy} error={error} onCancel={onDone} submitLabel="保存" />
    </form>
  )
}
