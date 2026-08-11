import { useEffect, useState } from 'react'
import { SearchIcon, ShieldCheckIcon, ChevronRightIcon, UsersIcon } from 'lucide-react'
import { API_BASE as API } from '../../lib/api'
import type { AdminUser } from '../../lib/types'
import { LoadingBlock } from '../../components/ui'

function formatBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

export function AdminUsers({ navigate }: { navigate: (to: string) => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUsers(null)
    fetch(`${API}/api/admin/users?q=${encodeURIComponent(q)}&limit=100`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { if (!cancelled) setUsers(d.users) })
      .catch(() => { if (!cancelled) setError('Could not load users.') })
    return () => { cancelled = true }
  }, [q])

  return (
    <div className="flex flex-col gap-24 fade-in">
      <div>
        <h2>Users</h2>
        <p className="text-sm text-secondary">Every account, its usage, limits, and admin status. Click a row for details.</p>
      </div>

      <div className="card">
        <div className="card-header"><UsersIcon size={15} color="var(--accent-light)" /><span className="card-title">User Directory</span></div>
        <div className="card-body">
          <div className="admin-search">
            <SearchIcon size={14} className="admin-search-icon" />
            <input
              className="form-input"
              placeholder="Search by email or display name…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          {!users && !error && <LoadingBlock label="Loading users…" />}

          {users && users.length === 0 && (
            <div className="empty-state">
              <p className="text-sm text-muted">No users found{ q ? ` for “${q}”` : '' }. Users appear here after their first request to the app.</p>
            </div>
          )}

          {users && users.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Analyses</th>
                    <th>Apps</th>
                    <th>Resumes</th>
                    <th>Storage</th>
                    <th>Limits (analysis / resume)</th>
                    <th>Status</th>
                    <th>Last seen</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user_id} className="admin-table-row" onClick={() => navigate(`/admin/users/${u.user_id}`)}>
                      <td>
                        <div className="admin-user-cell">
                          <div className="user-avatar">{((u.display_name || u.email || '?')[0] || '?').toUpperCase()}</div>
                          <div>
                            <div className="admin-user-name">{u.display_name || u.email || 'Unknown'}</div>
                            {u.display_name && u.email && <div className="text-xs text-muted">{u.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td>{u.analyses}</td>
                      <td>{u.applications}</td>
                      <td>{u.resumes}</td>
                      <td>{formatBytes(u.storage_bytes)}</td>
                      <td>
                        <span className="admin-limit-pill">{u.analysis_limit ?? 'default'}</span>
                        <span className="text-muted"> / </span>
                        <span className="admin-limit-pill">{u.resume_limit ?? 'default'}</span>
                      </td>
                      <td>
                        {u.is_admin
                          ? <span className="badge badge-completed"><ShieldCheckIcon size={11} /> Admin</span>
                          : <span className="badge badge-new">User</span>}
                      </td>
                      <td className="text-xs text-muted">{timeAgo(u.last_seen)}</td>
                      <td><ChevronRightIcon size={14} className="text-muted" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
