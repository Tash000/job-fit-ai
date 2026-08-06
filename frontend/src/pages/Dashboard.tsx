import { useState, useEffect } from 'react'
import {
  BriefcaseIcon, PlusIcon, ClipboardPasteIcon, ChevronRightIcon,
  TargetIcon, TrendingUpIcon, ZapIcon, UserIcon, CpuIcon,
  SparklesIcon, ArrowRightIcon, LayoutDashboardIcon,
} from 'lucide-react'
import { API_BASE as API } from '../lib/api'
import type { AppItem, Profile, Settings } from '../lib/types'
import { scoreClass, statusBadge, isProviderActive } from '../lib/types'
import { LoadingBlock } from '../components/ui'

interface DashboardProps {
  onOpenApp: (id: number) => void
  onNewApp: () => void
  onSmartPaste: () => void
  onGoTo: (view: 'apps' | 'profile' | 'settings') => void
  userName?: string
}

export function DashboardView({ onOpenApp, onNewApp, onSmartPaste, onGoTo, userName }: DashboardProps) {
  const [apps, setApps] = useState<AppItem[] | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    fetch(`${API}/api/applications`)
      .then(r => r.json())
      .then(d => setApps(Array.isArray(d) ? d : []))
      .catch(() => setApps([]))
    fetch(`${API}/api/profile`)
      .then(r => r.json())
      .then(d => setProfile(d && d.resume_text !== undefined ? d : null))
      .catch(() => setProfile(null))
    fetch(`${API}/api/settings`)
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {})
  }, [])

  if (apps === null) return <LoadingBlock label="Loading your dashboard…" />

  const analyzed = apps.filter(a => a.match_score > 0)
  const avgMatch = analyzed.length
    ? Math.round(analyzed.reduce((s, a) => s + a.match_score, 0) / analyzed.length)
    : 0
  const best = analyzed.length
    ? analyzed.reduce((a, b) => (a.match_score > b.match_score ? a : b))
    : null
  const recent = [...apps].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 5)
  const name = profile?.parsed_profile?.name?.split(' ')[0] || userName || 'there'
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  const provider = settings?.active_provider ?? 'gemini'
  const providerActive = isProviderActive(settings)

  const stats = [
    { label: 'Applications', value: apps.length, icon: BriefcaseIcon, tint: 'blue' },
    { label: 'Analyzed', value: analyzed.length, icon: ZapIcon, tint: 'teal' },
    { label: 'Avg. match', value: avgMatch ? `${avgMatch}%` : '—', icon: TrendingUpIcon, tint: 'purple' },
    { label: 'Best match', value: best ? `${best.match_score}%` : '—', icon: TargetIcon, tint: 'green' },
  ]

  return (
    <div className="flex flex-col gap-20 fade-in">
      {/* Greeting */}
      <div className="dash-hero">
        <div>
          <p className="text-xs text-muted">{today}</p>
          <h2>Welcome back, {name}</h2>
          <p className="text-sm text-secondary">Here's where your job hunt stands today.</p>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-secondary" onClick={onSmartPaste}>
            <ClipboardPasteIcon size={14} />Smart Paste
          </button>
          <button className="btn btn-primary" onClick={onNewApp}>
            <PlusIcon size={14} />New Application
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {stats.map(({ label, value, icon: Icon, tint }) => (
          <div key={label} className="stat-card">
            <div className={`stat-icon stat-${tint}`}><Icon size={18} /></div>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        {/* Recent applications */}
        <div className="card">
          <div className="card-header">
            <LayoutDashboardIcon size={15} color="var(--accent-light)" />
            <span className="card-title">Recent Applications</span>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onGoTo('apps')}>
              View all <ArrowRightIcon size={13} />
            </button>
          </div>
          <div className="card-body">
            {recent.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <BriefcaseIcon size={32} className="empty-state-icon" />
                <h3>No applications yet</h3>
                <p>Add your first job application to start the AI analysis.</p>
                <button className="btn btn-primary btn-sm" onClick={onNewApp} style={{ marginTop: 4 }}>
                  <PlusIcon size={13} />Add Application
                </button>
              </div>
            ) : (
              <div className="flex flex-col">
                {recent.map(a => (
                  <button key={a.id} className="dash-app-row" onClick={() => onOpenApp(a.id)}>
                    <div className="app-company-logo">{a.company[0]}</div>
                    <div className="app-info" style={{ flex: 1, minWidth: 0 }}>
                      <div className="app-company">{a.company}</div>
                      <div className="app-position">{a.position}</div>
                    </div>
                    <span className={statusBadge(a.status)}>{a.status}</span>
                    <div className={`score-mini ${scoreClass(a.match_score)}`}>
                      {a.match_score > 0 ? `${a.match_score}` : '–'}
                    </div>
                    <ChevronRightIcon size={14} color="var(--text-muted)" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-16">
          {/* Quick actions */}
          <div className="card">
            <div className="card-header"><SparklesIcon size={15} color="var(--accent-light)" /><span className="card-title">Quick Actions</span></div>
            <div className="card-body flex flex-col gap-8">
              <button className="btn btn-secondary w-full justify-start" onClick={onNewApp}>
                <PlusIcon size={14} />Add a new application
              </button>
              <button className="btn btn-secondary w-full justify-start" onClick={onSmartPaste}>
                <ClipboardPasteIcon size={14} />Smart-paste a job posting
              </button>
              <button className="btn btn-secondary w-full justify-start" onClick={() => onGoTo('profile')}>
                <UserIcon size={14} />Update your resume profile
              </button>
              <button className="btn btn-secondary w-full justify-start" onClick={() => onGoTo('settings')}>
                <CpuIcon size={14} />Configure AI provider
              </button>
            </div>
          </div>

          {/* Provider status */}
          <div className="card card-accent">
            <div className="card-header"><CpuIcon size={15} color="var(--accent-light)" /><span className="card-title">AI Provider</span></div>
            <div className="card-body">
              <div className="flex items-center gap-10">
                <div className={`provider-badge ${providerActive ? '' : 'inactive'}`}>
                  <span className="dot" />
                  {provider.toUpperCase()}
                </div>
                <span className="text-sm text-secondary">
                  {providerActive
                    ? 'Ready — AI features are available.'
                    : 'No API key configured yet.'}
                </span>
              </div>
              {!providerActive && (
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => onGoTo('settings')}>
                  Add API key
                </button>
              )}
            </div>
          </div>

          {/* Best match highlight */}
          {best && (
            <div className="card" style={{ borderColor: 'var(--success-border)' }}>
              <div className="card-header"><TargetIcon size={15} color="var(--success)" /><span className="card-title">Top Opportunity</span></div>
              <div className="card-body flex items-center gap-12">
                <div className={`score-mini ${scoreClass(best.match_score)}`} style={{ width: 52, height: 52, fontSize: '0.95rem' }}>
                  {best.match_score}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="app-company">{best.company}</div>
                  <div className="app-position">{best.position}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => onOpenApp(best.id)}>Open</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
