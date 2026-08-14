import { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react'
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
import { Toast, LoadingBlock } from './components/ui'
import { InstallButton } from './components/InstallButton'
import { InstallPrompt } from './components/InstallPrompt'
import { SetupWizard } from './components/SetupWizard'
import { loadCachedSettings, saveCachedSettings } from './lib/settingsCache'
// The landing page is what a signed-out visitor sees first, so it stays in the
// entry bundle. Everything behind the sign-in gate is split out: it is dead
// weight for anonymous traffic, and a signed-in user fetches the chunk while
// the first API calls are still in flight.
import LandingPage from './pages/Landing'
import type { AppsFilter } from './pages/Applications'
const DashboardView = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.DashboardView })))
const ApplicationsView = lazy(() => import('./pages/Applications').then(m => ({ default: m.ApplicationsView })))
const ProfileView = lazy(() => import('./pages/Profile').then(m => ({ default: m.ProfileView })))
const SettingsView = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsView })))
const AdminConsole = lazy(() => import('./pages/admin/AdminConsole').then(m => ({ default: m.AdminConsole })))

type View = 'dashboard' | 'profile' | 'apps' | 'settings'

// Sidebar order (desktop + mobile): Dashboard, Resume & Profile, Applications,
// Settings — Resume sits second so users find their setup step right away.
const VIEW_META: Record<View, { label: string; short: string; icon: typeof LayoutDashboardIcon; hint: string }> = {
  dashboard: { label: 'Dashboard', short: 'Home', icon: LayoutDashboardIcon, hint: 'Your job hunt at a glance' },
  profile:   { label: 'Resume & Profile', short: 'Profile', icon: UserIcon, hint: 'Your resume powers every analysis' },
  apps:      { label: 'Applications', short: 'Apps', icon: BriefcaseIcon, hint: 'Track, analyze, and perfect every application' },
  settings:  { label: 'Settings', short: 'Settings', icon: SettingsIcon, hint: 'Providers, models, appearance' },
}

/** URL path ↔ view mapping for the user-mode pages. */
const VIEW_PATHS: Record<View, string> = {
  dashboard: '/',
  profile: '/profile',
  apps: '/applications',
  settings: '/settings',
}
const PATH_VIEW: Record<string, View> = {
  '/': 'dashboard',
  '/profile': 'profile',
  '/applications': 'apps',
  '/settings': 'settings',
}

function currentPath() {
  return window.location.pathname
}

/** Derive the view from a URL path (defaults to dashboard). */
function viewFromPath(p: string): View {
  return PATH_VIEW[p] ?? 'dashboard'
}

export default function App() {
  const { user, loading, signOut } = useAuth()
  const { resolved: theme, toggleTheme } = useAppearance()
  const [nav, setNav] = useState<View>(() => viewFromPath(currentPath()))
  const [path, setPath] = useState(currentPath)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [focusApp, setFocusApp] = useState<number | null>(null)
  const [newAppToken, setNewAppToken] = useState(0)
  const [pasteToken, setPasteToken] = useState(0)
  // Filter requested by a dashboard stat card (e.g. "Analyzed" → apps, filtered).
  const [appsFilter, setAppsFilter] = useState<AppsFilter>('all')
  const [appsFilterToken, setAppsFilterToken] = useState(0)
  const [showSetup, setShowSetup] = useState(false)
  // Show the setup popup at most once per page load (i.e. per login), until
  // the account has its own provider key.
  const setupPrompted = useRef(false)

  const notify = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => setToast({ msg, type }), [])
  const closeToast = useCallback(() => setToast(null), [])

  /** Lightweight client-side router: pushes one entry per explicit navigation. */
  const navigate = useCallback((to: string) => {
    if (currentPath() !== to) window.history.pushState({}, '', to)
    setPath(to)
    const v = viewFromPath(to)
    setNav(v)
    window.scrollTo(0, 0)
  }, [])

  // Browser Back/Forward: derive the view from the URL WITHOUT pushing new
  // history entries. This is what makes the back button walk through the app's
  // views (dashboard → profile → apps → settings) instead of fighting the
  // router or escaping to the previous site.
  useEffect(() => {
    const onPop = () => {
      const p = currentPath()
      setPath(p)
      setNav(viewFromPath(p))
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Clean up Supabase OAuth/magic-link hash leftovers (#access_token=…) so a
  // Back click or refresh never replays the token exchange.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search)
    }
  }, [])

  // If the session expires server-side (401), log out and show the landing page.
  useEffect(() => {
    const onExpired = () => { void signOut() }
    window.addEventListener('vitralume:auth-expired', onExpired)
    return () => window.removeEventListener('vitralume:auth-expired', onExpired)
  }, [signOut])

  // Load settings once per user: seed from the per-user cache so the first
  // paint is instant, then refresh from the server and update the cache.
  const userId = user?.id
  useEffect(() => {
    if (!userId) {
      setSettings(null)
      setSettingsLoaded(false)
      return
    }
    const cached = loadCachedSettings(userId)
    if (cached) setSettings(cached)
    setSettingsLoaded(false)
    fetch(`${API}/api/settings`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) {
          setSettings(d)
          saveCachedSettings(userId, d)
        }
        setSettingsLoaded(true)
      })
      .catch(() => setSettingsLoaded(true))
  }, [userId])

  // Setup popup: every login, until the account adds its own provider key.
  const needsOwnKey = settingsLoaded && !!user && !settings?.is_admin && !settings?.has_own_key
  useEffect(() => {
    if (needsOwnKey && !setupPrompted.current) {
      setupPrompted.current = true
      setShowSetup(true)
    }
  }, [needsOwnKey])

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
      <Suspense fallback={<LoadingBlock label="Loading admin console…" />}>
        <AdminConsole
          path={path}
          navigate={navigate}
          user={user}
          theme={theme}
          toggleTheme={toggleTheme}
          signOut={signOut}
          notify={notify}
        />
      </Suspense>
    )
  }

  const providerLabel = settings?.active_provider ?? 'gemini'
  const providerActive = isProviderActive(settings)
  const meta = VIEW_META[nav]

  const goToApps = (appId?: number) => {
    setFocusApp(appId ?? null)
    navigate('/applications')
  }
  const goToNewApp = () => {
    setFocusApp(null)
    setNewAppToken(t => t + 1)
    navigate('/applications')
  }
  const goToSmartPaste = () => {
    setFocusApp(null)
    setPasteToken(t => t + 1)
    navigate('/applications')
  }

  return (
    <div className="app-shell">
      {/* ── Sidebar (desktop) ── */}
      <aside className="sidebar">
        <a className="sidebar-logo" href="#" onClick={e => { e.preventDefault(); navigate('/') }}>
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
                onClick={() => navigate(VIEW_PATHS[v])}
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
          <Suspense fallback={<LoadingBlock label={`Loading ${VIEW_META[nav].label.toLowerCase()}…`} />}>
            {nav === 'dashboard' && (
              <DashboardView
                onOpenApp={id => goToApps(id)}
                onNewApp={goToNewApp}
                onSmartPaste={goToSmartPaste}
                onGoTo={(v, filter) => {
                  if (filter) {
                    setAppsFilter(filter)
                    setAppsFilterToken(t => t + 1)
                  }
                  navigate(VIEW_PATHS[v])
                }}
                userName={user.email.split('@')[0]}
                settings={settings}
              />
            )}
            {nav === 'apps' && (
              <ApplicationsView
                notify={notify}
                focusId={focusApp}
                newToken={newAppToken}
                pasteToken={pasteToken}
                initialFilter={appsFilter}
                filterToken={appsFilterToken}
                onNeedSetup={() => setShowSetup(true)}
                settings={settings}
              />
            )}
            {nav === 'profile' && <ProfileView notify={notify} />}
            {nav === 'settings' && (
              <SettingsView initial={settings} notify={notify} onSaved={s => { setSettings(s); if (userId) saveCachedSettings(userId, s) }} />
            )}
          </Suspense>
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
              onClick={() => navigate(VIEW_PATHS[v])}
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
      <SetupWizard
        open={showSetup}
        settings={settings}
        onClose={() => setShowSetup(false)}
        onGoTo={navigate}
      />
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={closeToast} />}
    </div>
  )
}
