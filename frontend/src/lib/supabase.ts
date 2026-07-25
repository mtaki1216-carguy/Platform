import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** チーム共有アカウントのメールアドレス。画面ではパスワードのみ入力させる。 */
export const TEAM_EMAIL = import.meta.env.VITE_TEAM_EMAIL ?? ''
export const TEAM_NAME = import.meta.env.VITE_TEAM_NAME ?? '耐久レースチーム'

/**
 * 環境変数が未設定でも画面を白紙にせず、設定手順を出したいので
 * ここでは throw せずフラグで持つ。
 */
export const isConfigured = Boolean(url && anonKey && TEAM_EMAIL)

export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)

/** PostgrestError などを日本語のひとことに落とす */
export function describeError(error: unknown): string {
  if (!error) return '不明なエラーが発生しました'
  const message = typeof error === 'string' ? error : (error as { message?: string }).message ?? ''

  // Supabase はメール違いとパスワード違いを区別せず同じ応答を返すため、
  // 「パスワードが違います」と断定すると設定ミスのときに原因を見失う
  if (/invalid login credentials/i.test(message)) {
    return `ログインできません。パスワードが違うか、設定されているメールアドレス（${TEAM_EMAIL || '未設定'}）が Supabase に登録したアカウントと一致していません`
  }
  if (/email not confirmed/i.test(message)) {
    return 'このアカウントのメールアドレスが未確認です。Supabase の Authentication → Users で該当ユーザーを Confirm してください'
  }
  if (/failed to fetch|network/i.test(message)) {
    return '通信に失敗しました。ネットワークと VITE_SUPABASE_URL の設定を確認してください'
  }
  if (/row-level security/i.test(message)) {
    return '権限がありません。ログイン状態を確認してください（再ログインで解決する場合があります）'
  }
  if (/violates foreign key .*expenses_paid_by/i.test(message)) {
    return 'このメンバーは立替の支払者として支出に記録されているため削除できません。記録を残す必要があるので、削除ではなく名前の変更で対応してください'
  }
  if (/expenses_payer_consistency/i.test(message)) {
    return '立替の場合は立替者を選んでください'
  }
  return message || '不明なエラーが発生しました'
}
