import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { TEAM_EMAIL, describeError, supabase } from '../lib/supabase'

/**
 * チーム共通パスワードでのログイン。
 *
 * 実体は Supabase Auth の「共有アカウント1つ」。メールアドレスは環境変数から
 * 埋めるので、5人はパスワードだけを入力する。画面側だけのパスワード判定と違い、
 * RLS が authenticated ロールを要求するため、サインインしない限り
 * データベースからは1行も読めない。
 */
interface Auth {
  session: Session | null
  ready: boolean
  signIn: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

const Context = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<Auth>(
    () => ({
      session,
      ready,
      async signIn(password: string) {
        const { error } = await supabase.auth.signInWithPassword({
          email: TEAM_EMAIL,
          password,
        })
        if (error) throw new Error(describeError(error))
      },
      async signOut() {
        await supabase.auth.signOut()
      },
    }),
    [session, ready],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAuth(): Auth {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useAuth は AuthProvider の中で呼んでください')
  return ctx
}
