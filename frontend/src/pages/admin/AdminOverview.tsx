import { useEffect, useState } from 'react'
import {
  UsersIcon, BriefcaseIcon, SparklesIcon, FileTextIcon, DatabaseIcon,
  GaugeIcon, TrendingUpIcon, ClockIcon, CpuIcon,
} from 'lucide-react'
import { API_BASE as API } from '../../lib/api'
import type { AdminOverview as Overview } from '../../lib/types'
import { LoadingBlock } from '../../components/ui'

function formatBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  nim: 'NVIDIA NIM',
  ollama: 'Ollama (local)',
}

export function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/api/admin/overview`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch(() => setError('Could not load platform overview.'))
  }, [])

  if (error) return <div className="card"><div className="card-body text-sm text-secondary">{error}</div></div>
  if (!data) return <LoadingBlock label="Loading overview…" />

  const t = data.totals
  const providerTotal = Math.max(1, Object.values(data.by_provider).reduce((a, b) => a + b, 0))

  return (
    <div className="flex flex-col gap-24 fade-in">
      <div>
        <h2>Platform Overview</h2>
        <p className="text-sm text-secondary">Everything happening across the app — usage, storage, and provider health.</p>
      </div>

      {/* ── Headline stats ── */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon stat-blue"><UsersIcon size={18} /></div>
          <div className="stat-value">{t.users}</div>
          <div className="stat-label">Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-purple"><BriefcaseIcon size={18} /></div>
          <div className="stat-value">{t.applications}</div>
          <div className="stat-label">Applications</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-teal"><SparklesIcon size={18} /></div>
          <div className="stat-value">{t.analyses}</div>
          <div className="stat-label">Job analyses</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-green"><FileTextIcon size={18} /></div>
          <div className="stat-value">{t.resumes}</div>
          <div className="stat-label">Saved resumes</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-blue"><DatabaseIcon size={18} /></div>
          <div className="stat-value">{formatBytes(t.storage_bytes)}</div>
          <div className="stat-label">Storage used</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-green"><GaugeIcon size={18} /></div>
          <div className="stat-value">{data.avg_match}%</div>
          <div className="stat-label">Avg fit score</div>
        </div>
      </div>

      {/* ── Recent activity & providers ── */}
      <div className="split-layout-wide">
        {/* Last 7 days / today */}
        <div className="card">
          <div className="card-header"><TrendingUpIcon size={15} color="var(--accent-light)" /><span className="card-title">Recent Activity</span></div>
          <div className="card-body flex flex-col gap-12">
            <div className="overview-row">
              <div>
                <div className="form-label">Analyses (last 7 days)</div>
                <div className="text-xs text-muted">Active users in the last 7 days: {data.last7d.active_users}</div>
              </div>
              <div className="overview-big">{data.last7d.analyses}</div>
            </div>
            <div className="overview-row">
              <div>
                <div className="form-label">Analyses today</div>
                <div className="text-xs text-muted">New signups today: {data.today.new_users}</div>
              </div>
              <div className="overview-big">{data.today.analyses}</div>
            </div>
            <div className="overview-row">
              <div>
                <div className="form-label">Default limits</div>
                <div className="text-xs text-muted">Per-account caps applied unless overridden</div>
              </div>
              <div className="overview-big overview-big-sm">
                {data.limits.default_analysis} analyses · {data.limits.default_resume} resumes
              </div>
            </div>
          </div>
        </div>

        {/* Provider usage */}
        <div className="card">
          <div className="card-header"><CpuIcon size={15} color="var(--accent-light)" /><span className="card-title">Provider Usage</span></div>
          <div className="card-body flex flex-col gap-14">
            {Object.entries(data.by_provider).map(([key, count]) => (
              <div key={key} className="provider-bar-row">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{PROVIDER_LABELS[key] ?? key}</span>
                  <span className="text-sm text-secondary">{count} users</span>
                </div>
                <div className="provider-bar-track">
                  <div
                    className="provider-bar-fill"
                    style={{ width: `${Math.max(2, Math.round((count / providerTotal) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="overview-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div>
                <div className="form-label"><ClockIcon size={13} style={{ display: 'inline', marginRight: 4 }} />Last seen</div>
                <div className="text-xs text-muted">Users active in the last 7 days</div>
              </div>
              <div className="overview-big">{data.last7d.active_users}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
