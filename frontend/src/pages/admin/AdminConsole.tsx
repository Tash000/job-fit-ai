import {
  LayoutDashboardIcon, UsersIcon, ActivityIcon, ShieldCheckIcon,
  ArrowLeftIcon, SunIcon, MoonIcon, LogOutIcon,
} from 'lucide-react'
import type { AuthUser } from '../../lib/auth'
import type { Notify } from '../../lib/types'
import { AdminOverview } from './AdminOverview'
import { AdminUsers } from './AdminUsers'
import { AdminUserDetail } from './AdminUserDetail'
import { AdminActivity } from './AdminActivity'

type Sub = 'dashboard' | 'users' | 'activity'

const SUB_META: Record<Sub, { label: string; icon: typeof LayoutDashboardIcon; hint: string }> = {
  dashboard: { label: 'Overview', icon: LayoutDashboardIcon, hint: 'Platform usage at a glance' },
  users:     { label: 'Users', icon: UsersIcon, hint: 'Accounts, limits, and admin status' },
  activity:  { label: 'Activity', icon: ActivityIcon, hint: 'Audit trail of recent actions' },
}

export function AdminConsole({
  path, navigate, user, theme, toggleTheme, signOut, notify,
}: {
  path: string
  navigate: (to: string) => void
  user: AuthUser
  theme: string
  toggleTheme: () => void
  signOut: () => void
  notify: Notify
}) {
  const segs = path.split('/').filter(Boolean) // ['admin', sub, ...]
  // Unknown sub-paths fall back to the overview instead of crashing the topbar.
  const rawSub = segs[1] as Sub
  const sub: Sub = rawSub in SUB_META ? rawSub : 'dashboard'
  const uid = segs[2]
  const meta = SUB_META[sub]

  return (
    <div className="admin-shell">
      {/* ── Admin sidebar (desktop) ── */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-icon"><ShieldCheckIcon size={17} /></span>
          <div>
            <span className="admin-brand-name">Vitralume</span>
            <span className="admin-brand-sub">Admin Console</span>
          </div>
        </div>

        <nav className="admin-nav">
          {(Object.keys(SUB_META) as Sub[]).map(s => {
            const Icon = SUB_META[s].icon
            const active = s === sub || (s === 'users' && sub === 'users')
            return (
              <button
                key={s}
                className={`admin-nav-btn ${active ? 'active' : ''}`}
                onClick={() => navigate(`/admin/${s}`)}
              >
                <Icon size={16} />
                <span>{SUB_META[s].label}</span>
              </button>
            )
          })}
        </nav>

        <div className="admin-sidebar-foot">
          <div className="admin-user-chip">
            <div className="user-avatar">{(user.email ?? '?')[0].toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{(user.email ?? 'admin').split('@')[0]}</div>
              <div className="user-email">{user.email}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm admin-back-btn" onClick={() => navigate('/')}>
            <ArrowLeftIcon size={14} />Switch to app mode
          </button>
        </div>
      </aside>

      {/* ── Admin main column ── */}
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="topbar-title">
            <meta.icon size={17} color="var(--accent)" />
            <div>
              <span className="topbar-title-label">{meta.label}</span>
              <span className="topbar-title-hint">{meta.hint}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="admin-mode-pill"><ShieldCheckIcon size={12} />ADMIN</span>
            <button
              className="btn btn-ghost btn-icon btn-sm theme-toggle"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <MoonIcon size={15} /> : <SunIcon size={15} />}
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => { void signOut() }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOutIcon size={15} />
            </button>
          </div>
        </header>

        <main className="admin-content fade-in">
          {sub === 'dashboard' && <AdminOverview navigate={navigate} />}
          {sub === 'users' && (uid ? (
            <AdminUserDetail uid={uid} navigate={navigate} notify={notify} />
          ) : (
            <AdminUsers navigate={navigate} />
          ))}
          {sub === 'activity' && <AdminActivity />}
        </main>
      </div>

      {/* ── Mobile admin nav ── */}
      <nav className="admin-mobile-nav" aria-label="Admin">
        {(Object.keys(SUB_META) as Sub[]).map(s => {
          const Icon = SUB_META[s].icon
          return (
            <button
              key={s}
              className={`admin-mobile-btn ${s === sub ? 'active' : ''}`}
              onClick={() => navigate(`/admin/${s}`)}
              aria-label={SUB_META[s].label}
            >
              <Icon size={17} />
              <span>{SUB_META[s].label}</span>
            </button>
          )
        })}
        <button className="admin-mobile-btn" onClick={() => navigate('/')} aria-label="Back to app">
          <ArrowLeftIcon size={17} />
          <span>App</span>
        </button>
      </nav>
    </div>
  )
}
