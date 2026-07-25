import { Card } from './ui'
import { TeamMark } from './TeamMark'

/** 環境変数が未設定のときに白紙にせず、手順そのものを画面に出す */
export function SetupNotice() {
  return (
    <div className="center-screen">
      <div className="setup-doc">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <TeamMark size={26} />
          <h1 style={{ fontSize: 17 }}>セットアップが必要です</h1>
        </div>

        <Card title="1. Supabase プロジェクトを作る">
          <ol>
            <li>
              <a href="https://supabase.com" target="_blank" rel="noreferrer">
                supabase.com
              </a>
              で無料プロジェクトを作成します（リージョンは Northeast Asia / Tokyo が速いです）。
            </li>
            <li>
              SQL Editor を開き、リポジトリの <code>supabase/migrations/0001_init.sql</code> を貼り付けて実行。
            </li>
            <li>
              続けて <code>supabase/seed.sql</code> を実行してメンバー5名を登録。
            </li>
          </ol>
        </Card>

        <div style={{ height: 14 }} />

        <Card title="2. チーム共有アカウントを1つ作る">
          <ol>
            <li>
              Authentication → Users → <strong>Add user</strong> で、メールアドレスとチーム共通パスワードを設定します。
            </li>
            <li>
              <strong>Auto Confirm User</strong> を有効にして作成してください（確認メールを踏まずに使えます）。
            </li>
          </ol>
        </Card>

        <div style={{ height: 14 }} />

        <Card title="3. 環境変数を入れる">
          <p style={{ marginTop: 0 }}>
            <code>frontend/.env.example</code> を <code>frontend/.env.local</code> にコピーして、次の値を埋めます。
          </p>
          <ul>
            <li>
              <code>VITE_SUPABASE_URL</code>
            </li>
            <li>
              <code>VITE_SUPABASE_ANON_KEY</code>
            </li>
            <li>
              <code>VITE_TEAM_EMAIL</code>（手順2で作ったメールアドレス）
            </li>
          </ul>
          <p style={{ marginBottom: 0 }}>
            Vercel に載せる場合は、同じ3つを Project Settings → Environment Variables に登録してください。詳細は
            リポジトリの <code>README.md</code> にあります。
          </p>
        </Card>
      </div>
    </div>
  )
}
