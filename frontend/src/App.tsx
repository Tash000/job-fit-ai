import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboardIcon, BriefcaseIcon, UserIcon, SettingsIcon,
  LogOutIcon, SunIcon, MoonIcon,
} from 'lucide-react'
import './index.css'
import { useAuth } from './lib/auth'
import { useTheme } from './lib/theme'
import type { Settings } from './lib/types'
import { isProviderActive } from './lib/types'
import { API_BASE as API } from './lib/api'
import { Toast } from './components/ui'
import { InstallButton } from './components/InstallButton'
import LandingPage from './pages/Landing'
import { DashboardView } from './pages/Dashboard'
import { ApplicationsView } from './pages/Applications'
import { ProfileView } from './pages/Profile'
import { SettingsView } from './pages/Settings'

type View = 'dashboard' | 'apps' | 'profile' | 'settings'

const VIEW_META: Record<View, { label: string; icon: typeof LayoutDashboardIcon; hint: string }> = {
  dashboard: { label: 'Dashboard', icon: LayoutDashboardIcon, hint: 'Your job hunt at a glance' },
  apps:      { label: 'Applications', icon: BriefcaseIcon, hint: 'Track, analyze, and perfect every application' },
  profile:   { label: 'Resume & Profile', icon: UserIcon, hint: 'Your resume powers every analysis' },
  settings:  { label: 'Settings', icon: SettingsIcon, hint: 'Providers, models, and writing preferences' },
}

export default function App() {
  const { user, loading, signOut } = useAuth()
  const [theme, toggleTheme] = useTheme()
  const [nav, setNav] = useState<View>('dashboard')
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [focusApp, setFocusApp] = useState<number | null>(null)
  const [newAppToken, setNewAppToken] = useState(0)

  const notify = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => setToast({ msg, type }), [])
  const closeToast = useCallback(() => setToast(null), [])

  // If the session expires server-side (401), log out and show the landing page.
  useEffect(() => {
    const onExpired = () => { void signOut() }
    window.addEventListener('vitralume:auth-expired', onExpired)
    return () => window.removeEventListener('vitralume:auth-expired', onExpired)
  }, [signOut])

  useEffect(() => {
    fetch(`${API}/api/settings`)
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {})
  }, [user?.id])

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-overlay"><div className="spinner spinner-lg" /><span>Loading…</span></div>
      </div>
    )
  }

  // ── Public: landing page ──
  if (!user) return <LandingPage />

  const providerLabel = settings?.active_provider ?? 'gemini'
  const providerActive = isProviderActive(settings)
  const meta = VIEW_META[nav]

  const goToApps = (appId?: number) => {
    setFocusApp(appId ?? null)
    setNav('apps')
  }

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <a className="sidebar-logo" href="#" onClick={e => { e.preventDefault(); setNav('dashboard') }}>
          <span className="logo-dot" />
          <span>Vitralume</span>
        </a>

        <nav className="side-nav">
          {(Object.keys(VIEW_META) as View[]).map(v => {
            const Icon = VIEW_META[v].icon
            return (
              <button
                key={v}
                className={`side-nav-btn ${nav === v ? 'active' : ''}`}
                onClick={() => setNav(v)}
                title={VIEW_META[v].label}
              >
                <Icon size={17} />
                <span>{VIEW_META[v].label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className={`provider-badge ${providerActive ? '' : 'inactive'}`}>
            <span className="dot" />
            {providerLabel.toUpperCase()}
          </div>
          <div className="user-card">
            <div className="user-avatar">{(user.email ?? '?')[0].toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{user.email.split('@')[0]}</div>
              <div className="user-email">{user.email}</div>
            </div>
            <button
              className="btn btn-ghost btn-icon btn-sm user-signout"
              onClick={() => { void signOut() }}
              title="Sign out"
            >
              <LogOutIcon size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <meta.icon size={17} color="var(--accent)" />
            <div>
              <span className="topbar-title-label">{meta.label}</span>
              <span className="topbar-title-hint">{meta.hint}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <InstallButton />
            <button
              className="btn btn-ghost btn-icon btn-sm theme-toggle"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <MoonIcon size={15} /> : <SunIcon size={15} />}
            </button>
          </div>
        </header>

        <main className="main-content fade-in">
          {nav === 'dashboard' && (
            <DashboardView
              onOpenApp={id => goToApps(id)}
              onNewApp={() => { setFocusApp(null); setNav('apps'); setNewAppToken(t => t + 1) }}
              onSmartPaste={() => { setFocusApp(null); setNav('apps') }}
              onGoTo={v => setNav(v)}
              userName={user.email.split('@')[0]}
            />
          )}
          {nav === 'apps' && (
            <ApplicationsView notify={notify} focusId={focusApp} newToken={newAppToken} />
          )}
          {nav === 'profile' && <ProfileView notify={notify} />}
          {nav === 'settings' && (
            <SettingsView notify={notify} onSaved={s => setSettings(s)} />
          )}
        </main>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={closeToast} />}
    </div>
  )
}
