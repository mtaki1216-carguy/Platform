import { useState, type ReactNode } from 'react'

/** 空文字を null に落とす（DB の nullable 列に '' を入れないため） */
export function nullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** 数値入力を integer | null に落とす */
export function nullableInt(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? Math.round(n) : null
}

/**
 * フォームの送信・エラー表示・ボタンの共通部分。
 * onSubmit が throw したらその場にメッセージを出し、モーダルは閉じない。
 */
export function useSubmit(action: () => Promise<void>, onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, handle }
}

export function FormFooter({
  busy,
  error,
  onCancel,
  submitLabel,
}: {
  busy: boolean
  error: string | null
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <>
      {error ? <div className="form-error">{error}</div> : null}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          キャンセル
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? '保存中…' : submitLabel}
        </button>
      </div>
    </>
  )
}

/** <select> のオプションを型定義のラベル辞書から作る */
export function optionsFrom(dict: Record<string, string>): ReactNode {
  return Object.entries(dict).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ))
}
