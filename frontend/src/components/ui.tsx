import { useEffect, type ReactNode } from 'react'

/** 数値タイル。value は整形済みの文字列を渡す */
export function Stat({
  label,
  value,
  note,
  tone,
  hero,
  swatch,
}: {
  label: string
  value: ReactNode
  note?: ReactNode
  tone?: 'good' | 'bad'
  hero?: boolean
  swatch?: string
}) {
  return (
    <div className={`stat${hero ? ' stat--hero' : ''}`}>
      <div className="stat__label">
        {swatch ? <span className="dot" style={{ background: swatch }} /> : null}
        {label}
      </div>
      <div
        className={`stat__value${tone === 'good' ? ' value-good' : tone === 'bad' ? ' value-bad' : ''}`}
      >
        {value}
      </div>
      {note ? <div className="stat__note">{note}</div> : null}
    </div>
  )
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  flush,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
}) {
  return (
    <section className="card">
      {title ? (
        <header className="card__head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={`card__body${flush ? ' card__body--flush' : ''}`}>{children}</div>
    </section>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

export function Field({
  label,
  required,
  hint,
  wide,
  children,
}: {
  label: string
  required?: boolean
  hint?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <label className={`field${wide ? ' field--wide' : ''}`}>
      <span>
        {label}
        {required ? <span className="field__req">*</span> : null}
      </span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  )
}

export function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string
  onClose: () => void
  wide?: boolean
  children: ReactNode
}) {
  // Esc で閉じる／背後をスクロールさせない
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}

export function Banner({
  tone,
  children,
}: {
  tone: 'info' | 'warning' | 'critical'
  children: ReactNode
}) {
  const icon = tone === 'critical' ? '⚠' : tone === 'warning' ? '⚠' : 'ℹ'
  return (
    <div className={`banner banner--${tone}`}>
      <span aria-hidden="true">{icon}</span>
      <div>{children}</div>
    </div>
  )
}
