import { useEffect, useState } from 'react'
import { ActivityIcon } from 'lucide-react'
import { API_BASE as API } from '../../lib/api'
import type { AdminActivityItem } from '../../lib/types'
import { LoadingBlock } from '../../components/ui'

const ACTION_META: Record<string, { label: string; cls: string }> = {
  app_create: { label: 'Application added', cls: 'badge-analyzed' },
  analyze:    { label: 'Job analyzed', cls: 'badge-completed' },
  plan:       { label: 'Letter planned', cls: 'badge-analyzed' },
  generate:   { label: 'Letter generated', cls: 'badge-completed' },
  refine:     { label: 'Letter refined', cls: 'badge-warning' },
  resume_add: { label: 'Resume saved', cls: 'badge-analyzed' },
  admin_update: { label: 'Admin change', cls: 'badge-warning' },
  admin_clear:  { label: 'Storage cleared', cls: 'badge-warning' },
}

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function AdminActivity() {
  const [rows, setRows] = useState<AdminActivityItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/api/admin/activity?limit=100`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setRows)
      .catch(() => setError('Could not load activity.'))
  }, [])

  if (error) return <div className="card"><div className="card-body text-sm text-secondary">{error}</div></div>
  if (!rows) return <LoadingBlock label="Loading activity…" />

  return (
    <div className="flex flex-col gap-24 fade-in">
      <div>
        <h2>Activity</h2>
        <p className="text-sm text-secondary">A running audit trail of the last 100 actions across the platform.</p>
      </div>

      <div className="card">
        <div className="card-header"><ActivityIcon size={15} color="var(--accent-light)" /><span className="card-title">Audit Trail</span></div>
        <div className="card-body">
          {rows.length === 0 && <p className="text-sm text-muted">No activity yet — actions appear as users use the app.</p>}
          <div className="admin-activity-list">
            {rows.map(r => {
              const meta = ACTION_META[r.action] ?? { label: r.action, cls: 'badge-new' }
              return (
                <div key={r.id} className="admin-activity-row">
                  <span className={`badge ${meta.cls}`}>{meta.label}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail || '—'}</div>
                    <div className="text-xs text-muted">{r.email || r.user_id}</div>
                  </div>
                  <span className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.created_at)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
