import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { DataProvider, useTeamData } from './data/DataProvider'
import { Login } from './components/Login'
import { SetupNotice } from './components/SetupNotice'
import { TeamMark } from './components/TeamMark'
import { Banner } from './components/ui'
import { TEAM_NAME, isConfigured } from './lib/supabase'
import { Dashboard } from './pages/Dashboard'
import { BudgetPage } from './pages/BudgetPage'
import { MaintenancePage } from './pages/MaintenancePage'
import { RacesPage } from './pages/RacesPage'
import { MembersPage } from './pages/MembersPage'

export function App() {
  const { session, ready } = useAuth()

  if (!isConfigured) return <SetupNotice />
  if (!ready) return <div className="center-screen" />
  if (!session) return <Login />

  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}

const NAV = [
  { to: '/', label: 'ダッシュボード' },
  { to: '/budget', label: '予算管理' },
  { to: '/maintenance', label: '整備記録' },
  { to: '/races', label: 'レース管理' },
  { to: '/members', label: 'メンバー' },
]

function Shell() {
  const { signOut } = useAuth()
  const { loading, error, lastSyncedAt } = useTeamData()

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand">
            <TeamMark />
            {TEAM_NAME}
          </div>
          <nav className="nav">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'is-active' : undefined)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar__aside">
            <SyncIndicator loading={loading} at={lastSyncedAt} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void signOut()}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {error ? (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="critical">
              <strong>データを読み込めませんでした。</strong> {error}
            </Banner>
          </div>
        ) : null}

        {loading ? (
          <div className="empty">読み込み中…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/races" element={<RacesPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  )
}

function SyncIndicator({ loading, at }: { loading: boolean; at: Date | null }) {
  if (loading) return <span>同期中…</span>
  if (!at) return null
  const time = at.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  return (
    <span title="他の端末での変更は自動で反映されます">
      <span className="dot" style={{ background: '#0ca30c', marginRight: 6 }} />
      {time} 時点
    </span>
  )
}
