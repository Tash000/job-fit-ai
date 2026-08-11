import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboardIcon, BriefcaseIcon, UserIcon, SettingsIcon,
  LogOutIcon, SunIcon, MoonIcon, ShieldCheckIcon,
} from 'lucide-react'
import './index.css'
import { useAuth } from './lib/auth'
import { useAppearance } from './lib/theme'
import type { Settings } from './lib/types'
import { isProviderActive } from './lib/types'
import { API_BASE as API } from './lib/api'
import { Toast } from './components/ui'
import { InstallButton } from './components/InstallButton'
import { InstallPrompt } from './components/InstallPrompt'
import LandingPage from './pages/Landing'
import { DashboardView } from './pages/Dashboard'
import { ApplicationsView } from './pages/Applications'
import { ProfileView } from './pages/Profile'
import { SettingsView } from './pages/Settings'
import { AdminConsole } from './pages/admin/AdminConsole'

type View = 'dashboard' | 'apps' | 'profile' | 'settings'

const VIEW_META: Record<View, { label: string; short: string; icon: typeof LayoutDashboardIcon; hint: string }> = {
  dashboard: { label: 'Dashboard', short: 'Home', icon: LayoutDashboardIcon, hint: 'Your job hunt at a glance' },
  apps:      { label: 'Applications', short: 'Apps', icon: BriefcaseIcon, hint: 'Track, analyze, and perfect every application' },
  profile:   { label: 'Resume & Profile', short: 'Profile', icon: UserIcon, hint: 'Your resume powers every analysis' },
  settings:  { label: 'Settings', short: 'Settings', icon: SettingsIcon, hint: 'Providers, models, appearance' },
}

/** URL path ↔ view mapping for the user-mode pages. */
const VIEW_PATHS: Record<View, string> = {
  dashboard: '/',
  apps: '/applications',
  profile: '/profile',
  settings: '/settings',
}
const PATH_VIEW: Record<string, View> = {
  '/': 'dashboard',
  '/applications': 'apps',
  '/profile': 'profile',
  '/settings': 'settings',
}

function currentPath() {
  return window.location.pathname
}

export default function App() {
  const { user, loading, signOut } = useAuth()
  const { resolved: theme, toggleTheme } = useAppearance()
  const [nav, setNav] = useState<View>(() => PATH_VIEW[currentPath()] ?? 'dashboard')
  const [path, setPath] = useState(currentPath)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [focusApp, setFocusApp] = useState<number | null>(null)
  const [newAppToken, setNewAppToken] = useState(0)
  const [pasteToken, setPasteToken] = useState(0)

  const notify = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => setToast({ msg, type }), [])
  const closeToast = useCallback(() => setToast(null), [])

  /** Lightweight client-side router: updates the URL and re-renders. */
  const navigate = useCallback((to: string) => {
    if (currentPath() !== to) window.history.pushState({}, '', to)
    setPath(currentPath())
    window.scrollTo(0, 0)
  }, [])

  // Back/forward buttons update the view.
  useEffect(() => {
    const onPop = () => { setPath(currentPath()); window.scrollTo(0, 0) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Keep the URL in sync with the user-mode view (and restore nav when coming
  // back from the admin console).
  useEffect(() => {
    if (path.startsWith('/admin')) return
    const target = VIEW_PATHS[nav]
    if (currentPath() !== target) window.history.pushState({}, '', target)
    const mapped = PATH_VIEW[currentPath()]
    if (mapped && mapped !== nav) setNav(mapped)
  }, [nav, path])

  // If the session expires server-side (401), log out and show the landing page.
  useEffect(() => {
    const onExpired = () => { void signOut() }
    window.addEventListener('vitralume:auth-expired', onExpired)
    return () => window.removeEventListener('vitralume:auth-expired', onExpired)
  }, [signOut])

  // Only touch the settings endpoint when signed in — signed-out visitors on the
  // landing page should never trigger API calls (fixes stray 401/500 network errors).
  const userId = user?.id
  useEffect(() => {
    if (!userId) {
      setSettings(null)
      setSettingsLoaded(false)
      return
    }
    setSettingsLoaded(false)
    fetch(`${API}/api/settings`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { setSettings(d); setSettingsLoaded(true) })
      .catch(() => { setSettingsLoaded(true) })
  }, [userId])

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-overlay"><div className="spinner spinner-lg" /><span>Loading…</span></div>
      </div>
    )
  }

  // ── Public: landing page (the install prompt is available to visitors too) ──
  if (!user) return <LandingPage />

  const isAdminPath = path.startsWith('/admin')
  const isAdmin = settings?.is_admin === true

  // ── Admin console mode (/admin/*) — admins only ──
  if (isAdminPath) {
    if (!settingsLoaded) {
      return (
        <div className="app-shell">
          <div className="loading-overlay"><div className="spinner spinner-lg" /><span>Checking access…</span></div>
        </div>
      )
    }
    if (!isAdmin) {
      return (
        <div className="app-shell admin-denied">
          <div className="card fade-in" style={{ maxWidth: 420, margin: 'auto', textAlign: 'center', padding: 32 }}>
            <ShieldCheckIcon size={36} style={{ color: 'var(--danger)', marginBottom: 12 }} />
            <h3>Admin access required</h3>
            <p className="text-sm text-secondary" style={{ margin: '8px 0 20px' }}>
              This area is reserved for account administrators. You don't have admin rights on this account.
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>Back to the app</button>
          </div>
        </div>
      )
    }
    return (
      <AdminConsole
        path={path}
        navigate={navigate}
        user={user}
        theme={theme}
        toggleTheme={toggleTheme}
        signOut={signOut}
        notify={notify}
      />
    )
  }

  const providerLabel = settings?.active_provider ?? 'gemini'
  const providerActive = isProviderActive(settings)
  const meta = VIEW_META[nav]

  const goToApps = (appId?: number) => {
    setFocusApp(appId ?? null)
    setNav('apps')
  }

  return (
    <div className="app-shell">
      {/* ── Sidebar (desktop) ── */}
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
          {/* Admin console mode switch — visible to admins only */}
          {isAdmin && (
            <button
              className="side-nav-btn admin-mode-btn"
              onClick={() => navigate('/admin/dashboard')}
              title="Admin Console"
            >
              <ShieldCheckIcon size={17} />
              <span>Admin Console</span>
            </button>
          )}
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
            <button
              className="btn btn-ghost btn-icon btn-sm topbar-signout-mobile"
              onClick={() => { void signOut() }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOutIcon size={15} />
            </button>
          </div>
        </header>

        <main className="main-content fade-in">
          {nav === 'dashboard' && (
            <DashboardView
              onOpenApp={id => goToApps(id)}
              onNewApp={() => { setFocusApp(null); setNav('apps'); setNewAppToken(t => t + 1) }}
              onSmartPaste={() => { setFocusApp(null); setNav('apps'); setPasteToken(t => t + 1) }}
              onGoTo={v => setNav(v)}
              userName={user.email.split('@')[0]}
            />
          )}
          {nav === 'apps' && (
            <ApplicationsView notify={notify} focusId={focusApp} newToken={newAppToken} pasteToken={pasteToken} />
          )}
          {nav === 'profile' && <ProfileView notify={notify} />}
          {nav === 'settings' && (
            <SettingsView notify={notify} onSaved={s => setSettings(s)} />
          )}
        </main>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <nav className="mobile-nav" aria-label="Primary">
        {(Object.keys(VIEW_META) as View[]).map(v => {
          const Icon = VIEW_META[v].icon
          return (
            <button
              key={v}
              className={`mobile-nav-btn ${nav === v ? 'active' : ''}`}
              onClick={() => setNav(v)}
              aria-label={VIEW_META[v].label}
            >
              <Icon size={18} />
              <span>{VIEW_META[v].short}</span>
            </button>
          )
        })}
        {isAdmin && (
          <button
            className="mobile-nav-btn admin-mode-btn"
            onClick={() => navigate('/admin/dashboard')}
            aria-label="Admin Console"
          >
            <ShieldCheckIcon size={18} />
            <span>Admin</span>
          </button>
        )}
      </nav>

      <InstallPrompt />
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={closeToast} />}
    </div>
  )
}
