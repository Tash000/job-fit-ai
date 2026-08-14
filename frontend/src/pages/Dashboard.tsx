import { useState, useEffect } from 'react'
import {
  BriefcaseIcon, PlusIcon, ClipboardPasteIcon, ChevronRightIcon,
  TargetIcon, TrendingUpIcon, ZapIcon, UserIcon, CpuIcon,
  SparklesIcon, ArrowRightIcon, LayoutDashboardIcon, CheckCircleIcon, KeyIcon,
} from 'lucide-react'
import { API_BASE as API } from '../lib/api'
import type { AppItem, Profile, Settings } from '../lib/types'
import { scoreClass, statusBadge, isProviderActive, isUsingFreeAllowance } from '../lib/types'
import { LoadingBlock } from '../components/ui'

interface DashboardProps {
  onOpenApp: (id: number) => void
  onNewApp: () => void
  onSmartPaste: () => void
  onGoTo: (view: 'apps' | 'profile' | 'settings') => void
  userName?: string
  /** Fetched once in App; passed down so the dashboard doesn't refetch it. */
  settings: Settings | null
}

export function DashboardView({ onOpenApp, onNewApp, onSmartPaste, onGoTo, userName, settings }: DashboardProps) {
  const [apps, setApps] = useState<AppItem[] | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    fetch(`${API}/api/applications`)
      .then(r => r.json())
      .then(d => setApps(Array.isArray(d) ? d : []))
      .catch(() => setApps([]))
    fetch(`${API}/api/profile`)
      .then(r => r.json())
      .then(d => setProfile(d && d.resume_text !== undefined ? d : null))
      .catch(() => setProfile(null))
  }, [])

  if (apps === null) return <LoadingBlock label="Loading your dashboard…" />

  const analyzed = apps.filter(a => a.match_score > 0)
  const applied = apps.filter(a => a.applied)
  const avgMatch = analyzed.length
    ? Math.round(analyzed.reduce((s, a) => s + a.match_score, 0) / analyzed.length)
    : 0
  const best = analyzed.length
    ? analyzed.reduce((a, b) => (a.match_score > b.match_score ? a : b))
    : null
  const recent = [...apps].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 5)
  // Friendly greeting: display name > parsed first name > account username > generic.
  const name = profile?.display_name?.trim()
    || profile?.parsed_profile?.name?.split(' ')[0]
    || userName
    || 'there'
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  // A rotating set of quirky, friendly lines — changes every day.
  const FRIENDLY_LINES = [
    'Ready to land your next role? Let’s make it happen today.',
    'New job, new win — one application at a time.',
    'The perfect role is out there. Let’s go find it.',
    'Dream job hunting mode: activated.',
    'Every application is a step closer to your next offer.',
    'Your future self is cheering for you. Let’s get to work.',
  ]
  const dayIndex = Math.floor(Date.now() / 86_400_000) % FRIENDLY_LINES.length

  const provider = settings?.active_provider ?? 'gemini'
  const providerActive = isProviderActive(settings)

  const stats = [
    { label: 'Applications', value: apps.length, icon: BriefcaseIcon, tint: 'blue' },
    { label: 'Analyzed', value: analyzed.length, icon: ZapIcon, tint: 'teal' },
    { label: 'Applied', value: applied.length, icon: TargetIcon, tint: 'green' },
    { label: 'Avg. match', value: avgMatch ? `${avgMatch}%` : '—', icon: TrendingUpIcon, tint: 'purple' },
  ]

  // Setup checklist: visible until the user adds a key AND uploads a resume.
  const hasOwnKey = !!settings?.has_own_key || !!settings?.is_admin
  const hasResume = !!(profile?.resume_text ?? '').trim()
  const setupSteps = [
    {
      title: 'Add your Gemini API key',
      desc: 'Your own key powers every AI feature — get a free one from Google AI Studio.',
      actionLabel: 'Add key',
      action: () => onGoTo('settings'),
      done: hasOwnKey,
    },
    {
      title: 'Upload your resume',
      desc: 'AI parses your skills, experience and projects into your private profile.',
      actionLabel: 'Upload',
      action: () => onGoTo('profile'),
      done: hasResume,
    },
    {
      title: 'Analyze your first job',
      desc: 'Paste a posting or grab it from a URL, then run the AI analysis.',
      actionLabel: 'Add a job',
      action: onNewApp,
      done: apps.length > 0,
    },
  ].filter(s => !s.done)
  const doneSteps = 3 - setupSteps.length

  return (
    <div className="flex flex-col gap-20 fade-in">
      {/* Greeting */}
      <div className="dash-hero">
        <div>
          <p className="text-xs text-muted">{today}</p>
          <h2>Hi {name}, how are you today? 👋</h2>
          <p className="text-sm text-secondary">{FRIENDLY_LINES[dayIndex]}</p>
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

      {/* Get-Started checklist — shown until the account is set up */}
      {setupSteps.length > 0 && (
        <div className="card card-accent fade-in">
          <div className="card-header">
            <CheckCircleIcon size={15} color="var(--accent-light)" />
            <span className="card-title">Get started — {doneSteps}/{setupSteps.length} done</span>
          </div>
          <div className="card-body">
            <div className="flex flex-col gap-8">
              {setupSteps.map((s, i) => (
                <div key={i} className="setup-step" style={{ opacity: s.done ? 0.65 : 1 }}>
                  <div className={`setup-step-icon ${s.done ? 'done' : ''}`}>
                    {s.done ? <CheckCircleIcon size={16} /> : <KeyIcon size={16} />}
                  </div>
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div className="form-label" style={{ marginBottom: 1 }}>{s.title}</div>
                    {!s.done && <p className="text-xs text-muted" style={{ margin: 0 }}>{s.desc}</p>}
                  </div>
                  {!s.done && (
                    <button className="btn btn-secondary btn-sm" onClick={s.action} style={{ flexShrink: 0 }}>
                      {s.actionLabel} <ArrowRightIcon size={12} />
                    </button>
                  )}
                  {s.done && <span className="text-xs" style={{ color: 'var(--success)' }}>Done</span>}
                </div>
              ))}
            </div>
            {isUsingFreeAllowance(settings) && settings?.freeUsage && (
              <p className="text-xs text-muted" style={{ marginTop: 10 }}>
                Free allowance: <strong>{Math.max(0, (settings.freeUsage.analysesLimit ?? 2) - (settings.freeUsage.analysesUsed ?? 0))}</strong>{' '}
                job analyses · <strong>{Math.max(0, (settings.freeUsage.lettersLimit ?? 1) - (settings.freeUsage.lettersUsed ?? 0))}</strong>{' '}
                cover letter left on the shared key. Add your own Gemini key in Settings for unlimited use.
              </p>
            )}
          </div>
        </div>
      )}

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
