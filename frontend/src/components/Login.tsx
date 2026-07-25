import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { TEAM_NAME } from '../lib/supabase'
import { Field } from './ui'
import { TeamMark } from './TeamMark'

export function Login() {
  const { signIn } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <div className="login">
        <div className="login__head">
          <TeamMark size={34} />
          <h1>{TEAM_NAME} 運営プラットフォーム</h1>
          <p>チーム共通のパスワードを入力してください。</p>
        </div>

        <form className="card" onSubmit={onSubmit}>
          <div className="card__body">
            <Field label="チームパスワード" required>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                required
              />
            </Field>
            {error ? <div className="form-error">{error}</div> : null}
            <div className="form-actions">
              <button className="btn btn--primary" type="submit" disabled={busy || !password}>
                {busy ? 'ログイン中…' : 'ログイン'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
