import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { DataProvider, useTeamData } from './data/DataProvider'
import { Login } from './components/Login'
import { SetupNotice } from './components/SetupNotice'
import { TeamMark } from './components/TeamMark'
import { IconDashboard, IconFlag, IconMenu, IconUsers, IconWallet, IconWrench } from './components/icons'
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
  { to: '/', label: 'ダッシュボード', Icon: IconDashboard },
  { to: '/budget', label: '予算管理', Icon: IconWallet },
  { to: '/maintenance', label: '整備記録', Icon: IconWrench },
  { to: '/races', label: 'レース管理', Icon: IconFlag },
  { to: '/members', label: 'メンバー', Icon: IconUsers },
]

/** この幅以下ではサイドバーを画面に重ねるドロワーとして扱う（styles.css と合わせる） */
const DRAWER_QUERY = '(max-width: 880px)'

function Shell() {
  const { signOut } = useAuth()
  const { loading, error, lastSyncedAt } = useTeamData()
  const { pathname } = useLocation()
  // 狭い画面では閉じた状態から始める
  const [collapsed, setCollapsed] = useState(() => window.matchMedia(DRAWER_QUERY).matches)

  // ドロワーのときだけ、移動したら閉じる
  useEffect(() => {
    if (window.matchMedia(DRAWER_QUERY).matches) setCollapsed(true)
  }, [pathname])

  const current = NAV.find((item) => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)))

  return (
    <div className={`app${collapsed ? ' is-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="メインメニュー">
        <div className="sidebar__brand">
          <div className="brand">
            <TeamMark size={28} />
            {TEAM_NAME}
          </div>
        </div>
        <div className="sidebar__label">メニュー</div>
        <nav className="nav">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              <Icon className="nav__icon" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="sidebar-scrim" onClick={() => setCollapsed(true)} aria-hidden="true" />

      <div className="shell">
        <header className="topbar">
          <button
            type="button"
            className="topbar__menu"
            onClick={() => setCollapsed((v) => !v)}
            aria-label="メニューを開閉"
            aria-expanded={!collapsed}
          >
            <IconMenu />
          </button>
          <div className="topbar__title">{current?.label}</div>
          <div className="topbar__aside">
            <SyncIndicator loading={loading} at={lastSyncedAt} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void signOut()}>
              ログアウト
            </button>
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
    </div>
  )
}

function SyncIndicator({ loading, at }: { loading: boolean; at: Date | null }) {
  if (loading) return <span className="sync-chip">同期中…</span>
  if (!at) return null
  const time = at.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  return (
    <span className="sync-chip" title="他の端末での変更は自動で反映されます">
      <span className="dot" style={{ background: 'var(--good)', marginRight: 6 }} />
      {time} 時点
    </span>
  )
}
