import { useEffect, useState } from 'react'
import {
  ArrowLeftIcon, ShieldCheckIcon, SaveIcon, RotateCcwIcon, TrashIcon,
  AlertTriangleIcon, CheckCircleIcon, BriefcaseIcon, FileTextIcon,
} from 'lucide-react'
import { API_BASE as API } from '../../lib/api'
import type { AdminUserDetail as Detail, Notify } from '../../lib/types'
import { LoadingBlock } from '../../components/ui'
import { statusBadge } from '../../lib/types'

function formatBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function AdminUserDetail({ uid, navigate, notify }: { uid: string; navigate: (to: string) => void; notify: Notify }) {
  const [u, setU] = useState<Detail | null>(null)
  const [analysisLimit, setAnalysisLimit] = useState('')
  const [resumeLimit, setResumeLimit] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState<'applications' | 'resumes' | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    fetch(`${API}/api/admin/users/${encodeURIComponent(uid)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        setU(d)
        setAnalysisLimit(d.analysis_limit === null ? '' : String(d.analysis_limit))
        setResumeLimit(d.resume_limit === null ? '' : String(d.resume_limit))
      })
      .catch(() => setError('Could not load this user.'))
  }

  useEffect(load, [uid])

  async function saveLimits() {
    if (!u) return
    setSaving(true)
    setError(null)
    try {
      const parse = (s: string) => (s.trim() === '' ? 0 : Number(s))
      const r = await fetch(`${API}/api/admin/users/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_limit: parse(analysisLimit), resume_limit: parse(resumeLimit) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(typeof d?.detail === 'string' ? d.detail : 'Could not save limits.')
        return
      }
      notify('Limits updated', 'success')
      load()
    } catch { setError('Request failed.') }
    finally { setSaving(false) }
  }

  async function toggleAdmin() {
    if (!u) return
    setSaving(true)
    try {
      const r = await fetch(`${API}/api/admin/users/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin: !u.is_admin }),
      })
      if (r.ok) {
        notify(u.is_admin ? 'Admin access revoked' : 'Admin access granted', 'success')
        load()
      } else {
        const d = await r.json().catch(() => ({}))
        setError(typeof d?.detail === 'string' ? d.detail : 'Could not change admin status.')
      }
    } catch { setError('Request failed.') }
    finally { setSaving(false) }
  }

  async function confirmClear() {
    if (!clearing) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`${API}/api/admin/users/${encodeURIComponent(uid)}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: clearing }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(typeof d?.detail === 'string' ? d.detail : 'Could not clear storage.')
        setClearing(null)
        return
      }
      notify('Storage cleared', 'success')
      setClearing(null)
      load()
    } catch { setError('Request failed.'); setClearing(null) }
    finally { setSaving(false) }
  }

  if (error && !u) return <div className="card"><div className="card-body text-sm text-secondary">{error}</div></div>
  if (!u) return <LoadingBlock label="Loading user…" />

  return (
    <div className="flex flex-col gap-24 fade-in">
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/users')} style={{ marginBottom: 10 }}>
          <ArrowLeftIcon size={13} />Back to users
        </button>
        <div className="flex items-center gap-10 flex-wrap">
          <h2 style={{ margin: 0 }}>{u.display_name || u.email || 'Unknown user'}</h2>
          {u.is_admin
            ? <span className="badge badge-completed"><ShieldCheckIcon size={11} /> Admin</span>
            : <span className="badge badge-new">User</span>}
        </div>
        <p className="text-sm text-secondary" style={{ marginTop: 4 }}>{u.email}</p>
      </div>

      {error && <div className="card"><div className="card-body text-sm" style={{ color: 'var(--danger)' }}>{error}</div></div>}

      {/* Usage */}
      <div className="stat-grid stat-grid-4">
        <div className="stat-card"><div className="stat-icon stat-purple"><BriefcaseIcon size={17} /></div><div className="stat-value">{u.applications}</div><div className="stat-label">Applications</div></div>
        <div className="stat-card"><div className="stat-icon stat-teal"><CheckCircleIcon size={17} /></div><div className="stat-value">{u.analyses}</div><div className="stat-label">Analyses</div></div>
        <div className="stat-card"><div className="stat-icon stat-green"><FileTextIcon size={17} /></div><div className="stat-value">{u.resumes}</div><div className="stat-label">Resumes</div></div>
        <div className="stat-card"><div className="stat-icon stat-blue"><AlertTriangleIcon size={17} /></div><div className="stat-value">{formatBytes(u.storage_bytes)}</div><div className="stat-label">Storage</div></div>
      </div>

      <div className="split-layout-wide">
        {/* Limits */}
        <div className="card">
          <div className="card-header"><ShieldCheckIcon size={15} color="var(--accent-light)" /><span className="card-title">Limit Overrides</span></div>
          <div className="card-body settings-section">
            <p className="text-xs text-muted">
              Empty (or <strong>0</strong>) = platform default (<strong>500</strong> analyses / <strong>5</strong> resumes). Admins
              always bypass every cap regardless of these values — set a free-tier or paid-tier quota per user here.
            </p>
            <div className="form-group">
              <label className="form-label">Analysis limit (job analyses)</label>
              <input className="form-input" type="number" min={0} placeholder="500 (default)" value={analysisLimit}
                onChange={e => setAnalysisLimit(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Resume limit (saved CVs)</label>
              <input className="form-input" type="number" min={0} placeholder="5 (default)" value={resumeLimit}
                onChange={e => setResumeLimit(e.target.value)} />
            </div>
            <div className="flex gap-8">
              <button className="btn btn-primary btn-sm" onClick={saveLimits} disabled={saving}>
                {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={13} />Save limits</>}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={saving}
                onClick={() => { setAnalysisLimit(''); setResumeLimit('') }}>
                <RotateCcwIcon size={13} />Reset fields
              </button>
            </div>
          </div>
        </div>

        {/* Access */}
        <div className="card">
          <div className="card-header"><ShieldCheckIcon size={15} color="var(--accent-light)" /><span className="card-title">Admin Access</span></div>
          <div className="card-body settings-section">
            <p className="text-xs text-muted">
              Admins skip the per-minute rate limit and all storage caps. Grant only to trusted accounts.
            </p>
            <div className="admin-toggle-row">
              <div>
                <div className="form-label">Admin status</div>
                <div className="text-xs text-muted">{u.is_admin ? 'This user bypasses all limits.' : 'Regular user — standard limits apply.'}</div>
              </div>
              <button
                className={`btn btn-sm ${u.is_admin ? 'btn-danger' : 'btn-success'}`}
                onClick={toggleAdmin}
                disabled={saving}
              >
                {u.is_admin ? 'Revoke admin' : 'Grant admin'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card danger-zone">
        <div className="card-header"><AlertTriangleIcon size={15} color="var(--danger)" /><span className="card-title" style={{ color: 'var(--danger)' }}>Clear Storage</span></div>
        <div className="card-body flex flex-col gap-12">
          {clearing === null && (
            <>
              <div className="danger-row">
                <div className="flex-1">
                  <div className="form-label" style={{ color: 'var(--danger)' }}>Delete all applications & analyses</div>
                  <p className="text-xs text-muted" style={{ marginTop: 3 }}>Removes every job the user has saved or analyzed. Resumes are kept.</p>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => setClearing('applications')}><TrashIcon size={13} />Clear applications</button>
              </div>
              <div className="danger-row">
                <div className="flex-1">
                  <div className="form-label" style={{ color: 'var(--danger)' }}>Delete all saved resumes</div>
                  <p className="text-xs text-muted" style={{ marginTop: 3 }}>Removes the user's resume library. Applications are kept.</p>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => setClearing('resumes')}><TrashIcon size={13} />Clear resumes</button>
              </div>
              <div className="danger-row">
                <div className="flex-1">
                  <div className="form-label" style={{ color: 'var(--danger)' }}>Erase everything for this user</div>
                  <p className="text-xs text-muted" style={{ marginTop: 3 }}>Applications, analyses, resumes, and profile content — all gone.</p>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => setClearing('all')}><TrashIcon size={13} />Erase all</button>
              </div>
            </>
          )}
          {clearing !== null && (
            <div className="card fade-in" style={{ borderColor: 'var(--danger-border)', background: 'var(--danger-bg)' }}>
              <div className="card-body flex flex-col gap-12">
                <p className="text-sm text-secondary">
                  This permanently deletes <strong>{clearing === 'all' ? 'everything' : clearing}</strong> for this user.
                  This cannot be undone. Confirm to continue.
                </p>
                <div className="flex gap-8">
                  <button className="btn btn-danger btn-sm" onClick={confirmClear} disabled={saving}>
                    {saving ? <><div className="spinner" />Clearing…</> : <><TrashIcon size={13} />Confirm delete</>}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setClearing(null)} disabled={saving}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent applications */}
      <div className="card">
        <div className="card-header"><BriefcaseIcon size={15} color="var(--accent-light)" /><span className="card-title">Recent Applications</span></div>
        <div className="card-body">
          {u.recent_applications.length === 0 && <p className="text-sm text-muted">No applications yet.</p>}
          {u.recent_applications.map(a => (
            <div key={a.id} className="dash-app-row" style={{ cursor: 'default' }}>
              <div className="app-info">
                <div className="app-title-row">
                  <span className="app-company">{a.company}</span>
                  <span className={statusBadge(a.status)}>{a.status}</span>
                </div>
                <div className="app-meta">
                  {a.position} · {a.location || 'No location'} · score {a.match_score}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
