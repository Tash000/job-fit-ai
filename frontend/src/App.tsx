import { useState, useEffect, useCallback } from 'react'
import {
  BriefcaseIcon, UserIcon, SettingsIcon, PlusIcon, TrashIcon,
  ChevronRightIcon, BarChartIcon, FileTextIcon, SearchIcon,
  ZapIcon, DownloadIcon, CheckCircleIcon,
  XCircleIcon, AlertTriangleIcon, BookOpenIcon, CpuIcon,
  KeyIcon, ServerIcon, SaveIcon,
  ClipboardListIcon, ShieldCheckIcon, SparklesIcon, TargetIcon,
  ExternalLinkIcon, ClipboardPasteIcon, WandIcon, RefreshCcwIcon, MessageSquareIcon,
  LogOutIcon,
} from 'lucide-react'
import './index.css'
import { LoginScreen, useAuth } from './lib/auth'

// Backend base: same-origin in dev/self-host, or VITE_API_BASE in production.
// The interceptor in lib/api.ts attaches the Supabase Bearer token to /api calls.
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

// ─── Types ─────────────────────────────────────────────────────────────────

interface AppItem {
  id: number
  company: string
  position: string
  location: string
  status: string
  match_score: number
  created_at: string
}

interface AppDetail extends AppItem {
  description: string
  details?: {
    jobAnalysis?: Record<string, unknown>
    suitability?: Suitability
    gaps?: Gap[]
    researchMatcher?: ResearchMatch
  }
  resume_suggestions?: ATSResult
  cover_letter_plan?: PlanItem[]
  cover_letter?: string
  audit_trail?: AuditItem[]
  feedback?: Feedback
}

interface Suitability {
  overallMatch: number
  technical: number
  research: number
  leadership: number
  communication: number
  strengths: { title: string; desc: string }[]
  weaknesses: { title: string; desc: string }[]
}

interface Gap {
  skill: string
  effort: string
  resources: string[]
  difficulty: string
  impact: string
}

interface ATSResult {
  score: number
  keywords: { found: string[]; missing: string[]; matchRate: number }
  weakBullets: { original: string; issues: string[]; suggestion: string }[]
  orderingAlert?: string
  unusedProjects?: { title: string; technologies: string[]; matchingKeywords: string[]; reason: string }[]
}

interface ResearchMatch {
  alignment: Record<string, number>
  overlaps: { candidatePub: string; professorPub: string; similarity: number; topic: string }[]
  recommendations: string[]
}

interface PlanItem { paragraph: number; topic: string; details: string }
interface AuditItem { sentence: string; source: string; status: string }
interface Feedback {
  naturalness: number; grammar: number; researchFit: number
  specificity: number; aiRisk: string; overall: number
}

interface Profile {
  resume_text: string
  parsed_profile: {
    name: string; email: string; phone: string
    skills: string[]; career_goals: string
    projects: { title: string; technologies: string[]; description: string }[]
    publications: { title: string; authors: string; journal: string; year: number; abstract: string }[]
  }
}

interface Settings {
  gemini_models: string[]
  nim_models: string[]
  nim_base_url: string
  ollama_enabled: boolean
  ollama_base_url: string
  ollama_model: string
  active_provider: string
  forbidden_phrases: string[]
  tone_settings: { writingStyle?: string; activeVoice?: boolean; showMetricConfidence?: boolean }
  // Provider keys are WRITE-ONLY: the API returns only masked previews.
  keyInfo?: {
    gemini: { index: number; masked: string }[]
    nim: { index: number; masked: string }[]
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function scoreClass(s: number) {
  if (s >= 75) return 'high'
  if (s >= 50) return 'medium'
  if (s > 0) return 'low'
  return 'none'
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    New: 'badge-new', Analyzed: 'badge-analyzed',
    Completed: 'badge-completed', Planned: 'badge-analyzed',
  }
  return `badge ${map[status] ?? 'badge-new'}`
}

function ScoreRing({ value, size = 80 }: { value: number; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const fill = circ * (1 - value / 100)
  const color = value >= 75 ? 'var(--success)' : value >= 50 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={fill}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="score-ring-label">
        <div className="score-ring-value" style={{ fontSize: size * 0.22 }}>{value}</div>
        <div className="score-ring-sub">%</div>
      </div>
    </div>
  )
}

function ProgressBar({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  return (
    <div className="progress-bar-wrap">
      <div className="progress-bar-fill" style={{ width: `${value}%`, background: color }} />
    </div>
  )
}

function Toast({ msg, type, onClose }: { msg: string; type: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [onClose])
  const icon = type === 'success' ? <CheckCircleIcon size={16} color="var(--success)" />
    : type === 'error' ? <XCircleIcon size={16} color="var(--danger)" />
    : <ZapIcon size={16} color="var(--accent-light)" />
  return <div className={`toast ${type}`}>{icon}{msg}</div>
}

// ─── PWA Install Button ───────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferred) return null
  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        await deferred.prompt()
        await deferred.userChoice
        setDeferred(null)
      }}
    >
      <DownloadIcon size={13} />Install App
    </button>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading, signOut } = useAuth()
  const [nav, setNav] = useState<'apps' | 'profile' | 'settings'>('apps')
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)

  const notify = (msg: string, type = 'info') => setToast({ msg, type })

  // If the session expires server-side (401), log out and show the login screen.
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

  const providerLabel = settings?.active_provider ?? 'gemini'
  const providerActive = !!(
    (providerLabel === 'gemini' && (settings?.keyInfo?.gemini?.length ?? 0) > 0) ||
    (providerLabel === 'nim' && (settings?.keyInfo?.nim?.length ?? 0) > 0) ||
    (providerLabel === 'ollama' && settings?.ollama_enabled)
  )

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-overlay"><div className="spinner spinner-lg" /><span>Loading…</span></div>
      </div>
    )
  }
  if (!user) return <LoginScreen />

  return (
    <div className="app-shell">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbar-logo">
          <span className="logo-dot" />
          Vitralume
        </div>

        <nav className="topbar-nav">
          {([
            ['apps',     'Applications', BriefcaseIcon],
            ['profile',  'Profile',      UserIcon],
            ['settings', 'Settings',     SettingsIcon],
          ] as [string, string, typeof BriefcaseIcon][]).map(([key, label, Icon]) => (
            <button
              key={key}
              className={`topbar-nav-btn ${nav === key ? 'active' : ''}`}
              onClick={() => setNav(key as typeof nav)}
            >
              <Icon size={15} />{label}
            </button>
          ))}
        </nav>

        <div className="topbar-status">
          <InstallButton />
          <div className={`provider-badge ${providerActive ? '' : 'inactive'}`}>
            <span className="dot" />
            {providerLabel.toUpperCase()}
          </div>
          {user && (
            <button
              className="btn btn-ghost btn-sm topbar-user"
              onClick={() => { void signOut() }}
              title={`Signed in as ${user.email} — click to sign out`}
            >
              <LogOutIcon size={13} />{user.email.split('@')[0]}
            </button>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="main-content fade-in">
        {nav === 'apps'     && <ApplicationsView notify={notify} />}
        {nav === 'profile'  && <ProfileView notify={notify} />}
        {nav === 'settings' && <SettingsView notify={notify} onSaved={s => setSettings(s)} />}
      </main>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SMART JOB PASTE MODAL
// ══════════════════════════════════════════════════════════════════════════════

function SmartPasteModal({
  onClose,
  onExtracted,
  notify,
}: {
  onClose: () => void
  onExtracted: (data: { company: string; position: string; location: string; description: string }) => void
  notify: (m: string, t?: string) => void
}) {
  const [raw, setRaw] = useState('')
  const [extracting, setExtracting] = useState(false)

  async function extract() {
    if (!raw.trim()) { notify('Paste some text first', 'error'); return }
    setExtracting(true)
    try {
      const r = await fetch(`${API}/api/jobs/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: raw }),
      })
      const d = await r.json()
      onExtracted(d)
      onClose()
      notify('Job details extracted by AI', 'success')
    } catch { notify('Extraction failed', 'error') }
    finally { setExtracting(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div className="card fade-in" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="card-header" style={{ padding: '16px 20px 0' }}>
          <WandIcon size={16} color="var(--accent-light)" />
          <span className="card-title">Smart Job Paste</span>
          <button className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <XCircleIcon size={16} />
          </button>
        </div>
        <div className="card-body flex flex-col gap-12">
          <p className="text-sm text-secondary">
            Paste the <strong>full job posting</strong> — from LinkedIn, university site, email, anywhere.
            AI will extract the company, position, location, and clean description automatically.
          </p>
          <div className="form-group">
            <label className="form-label">Raw Job Posting Text</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: 240 }}
              placeholder="Paste the entire job posting here — the more text, the better the extraction…"
              value={raw}
              onChange={e => setRaw(e.target.value)}
            />
          </div>
          <div className="flex gap-8">
            <button className="btn btn-primary flex-1" onClick={extract} disabled={extracting}>
              {extracting
                ? <><div className="spinner" />Extracting with AI…</>
                : <><SparklesIcon size={14} />Extract & Fill</>}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// APPLICATIONS VIEW
// ══════════════════════════════════════════════════════════════════════════════

function ApplicationsView({ notify }: { notify: (m: string, t?: string) => void }) {
  const [apps, setApps] = useState<AppItem[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [form, setForm] = useState({ company: '', position: '', location: '', description: '' })

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/applications`)
      const data = await r.json().catch(() => [])
      setApps(Array.isArray(data) ? data : [])
    } catch {
      setApps([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!form.company || !form.position) { notify('Company and position are required', 'error'); return }
    const r = await fetch(`${API}/api/applications`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await r.json()
    notify(`Created application #${d.id}`, 'success')
    setCreating(false)
    setForm({ company: '', position: '', location: '', description: '' })
    await load()
    setSelected(d.id)
  }

  async function deleteApp(id: number) {
    await fetch(`${API}/api/applications/${id}`, { method: 'DELETE' })
    notify('Application deleted', 'success')
    if (selected === id) setSelected(null)
    await load()
  }

  return (
    <>
      {showPaste && (
        <SmartPasteModal
          onClose={() => setShowPaste(false)}
          onExtracted={d => {
            setForm(d)
            setCreating(true)
            setShowPaste(false)
          }}
          notify={notify}
        />
      )}
      <div className="split-layout">
      <div className="flex flex-col gap-16">
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: '1.1rem' }}>Applications</h2>
          <div className="flex gap-6">
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPaste(true)}>
              <ClipboardPasteIcon size={14} />Smart Paste
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              <PlusIcon size={14} />New
            </button>
          </div>
        </div>

        {creating && (
          <div className="card card-accent fade-in">
            <div className="card-header">
              <ClipboardListIcon size={16} color="var(--accent-light)" />
              <span className="card-title">New Application</span>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowPaste(true)}>
                <WandIcon size={13} />AI Fill from Job Post
              </button>
            </div>
            <div className="card-body flex flex-col gap-10">
              <div className="form-group">
                <label className="form-label">Company *</label>
                <input className="form-input" placeholder="e.g. NextGen Robotics Lab" value={form.company}
                  onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Position *</label>
                <input className="form-input" placeholder="e.g. Computer Vision Researcher" value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-input" placeholder="e.g. Munich, Germany" value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Job Description</label>
                <textarea className="form-textarea" placeholder="Paste the full job posting here…" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ minHeight: 120 }} />
              </div>
            <div className="flex gap-8">
                <button className="btn btn-primary flex-1" onClick={create}><SaveIcon size={14} />Save</button>
                <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {apps.length === 0 && !creating ? (
          <div className="empty-state">
            <BriefcaseIcon size={40} className="empty-state-icon" />
            <h3>No applications yet</h3>
            <p>Click <strong>New</strong> to add your first job application</p>
          </div>
        ) : (
          <div className="app-list scroll-y" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            {apps.map(a => (
              <div
                key={a.id}
                className={`app-list-item ${selected === a.id ? 'selected' : ''}`}
                onClick={() => setSelected(a.id)}
              >
                <div className="app-company-logo">{a.company[0]}</div>
                <div className="app-info">
                  <div className="app-company">{a.company}</div>
                  <div className="app-position">{a.position}</div>
                  <div className="flex gap-6 items-center" style={{ marginTop: 4 }}>
                    <span className={statusBadge(a.status)}>{a.status}</span>
                    {a.location && <span className="text-xs text-muted">{a.location}</span>}
                  </div>
                </div>
                <div className={`score-mini ${scoreClass(a.match_score)}`}>
                  {a.match_score > 0 ? `${a.match_score}` : '–'}
                </div>
                <button className="btn btn-danger btn-icon" onClick={e => { e.stopPropagation(); deleteApp(a.id) }}>
                  <TrashIcon size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: detail ── */}
      <div>
        {selected
          ? <ApplicationDetail id={selected} notify={notify} onRefreshList={load} />
          : (
            <div className="card" style={{ minHeight: 400 }}>
              <div className="empty-state" style={{ minHeight: 400 }}>
                <TargetIcon size={48} className="empty-state-icon" />
                <h3>Select an application</h3>
                <p>Choose an application from the list to view analysis, ATS score, research match, and generate your cover letter.</p>
              </div>
            </div>
          )
        }
      </div>
    </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// APPLICATION DETAIL
// ══════════════════════════════════════════════════════════════════════════════

function ApplicationDetail({ id, notify, onRefreshList }: { id: number; notify: (m: string, t?: string) => void; onRefreshList: () => void }) {
  const [app, setApp] = useState<AppDetail | null>(null)
  const [tab, setTab] = useState<'analysis' | 'ats' | 'research' | 'coverletter'>('analysis')
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const loadApp = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`${API}/api/applications/${id}`)
    setApp(await r.json())
    setLoading(false)
  }, [id])

  useEffect(() => { loadApp() }, [loadApp])

  async function analyze() {
    setAnalyzing(true)
    try {
      const r = await fetch(`${API}/api/applications/${id}/analyze`, { method: 'POST' })
      const d = await r.json()
      notify(`Analysis complete – Match: ${d.match_score}%`, 'success')
      await loadApp()
      await onRefreshList()
    } catch { notify('Analysis failed', 'error') }
    finally { setAnalyzing(false) }
  }

  if (loading) return <div className="card"><div className="loading-overlay"><div className="spinner spinner-lg" /><span>Loading application…</span></div></div>
  if (!app) return null

  const hasAnalysis = !!app.details?.suitability
  const hasCL = !!app.cover_letter

  return (
    <div className="flex flex-col gap-16 fade-in">
      {/* Header */}
      <div className="card">
        <div className="card-body">
          <div className="flex items-center gap-16 flex-wrap">
            <div className="app-company-logo" style={{ width: 56, height: 56, fontSize: '1.4rem' }}>
              {app.company[0]}
            </div>
            <div className="flex-1">
              <h2 style={{ margin: 0 }}>{app.company}</h2>
              <p style={{ fontSize: '0.95rem', marginTop: 2 }}>{app.position}</p>
              <div className="flex gap-8 items-center" style={{ marginTop: 6 }}>
                <span className={statusBadge(app.status)}>{app.status}</span>
                {app.location && <span className="text-xs text-muted">{app.location}</span>}
              </div>
            </div>
            {hasAnalysis && <ScoreRing value={app.match_score} size={80} />}
            <button
              className={`btn ${analyzing ? 'btn-ghost' : 'btn-primary'}`}
              onClick={analyze}
              disabled={analyzing}
            >
              {analyzing ? <><div className="spinner" />Analyzing…</> : <><ZapIcon size={15} />Analyze Job</>}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {([
          ['analysis',    'Analysis',     BarChartIcon],
          ['ats',         'ATS Score',    TargetIcon],
          ['research',    'Research',     BookOpenIcon],
          ['coverletter', 'Cover Letter', FileTextIcon],
        ] as [string, string, typeof BarChartIcon][]).map(([key, label, Icon]) => (
          <button
            key={key}
            className={`tab-btn ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key as typeof tab)}
          >
            <Icon size={14} />{label}
            {key === 'coverletter' && hasCL && <CheckCircleIcon size={12} color="var(--success)" />}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'analysis'    && <AnalysisTab app={app} notify={notify} />}
      {tab === 'ats'         && <ATSTab app={app} />}
      {tab === 'research'    && <ResearchTab app={app} />}
      {tab === 'coverletter' && <CoverLetterTab app={app} notify={notify} onRefresh={loadApp} />}
    </div>
  )
}

// ── Analysis Tab ─────────────────────────────────────────────────────────────

function AnalysisTab({ app }: { app: AppDetail; notify: (m: string, t?: string) => void }) {
  const suit = app.details?.suitability
  const gaps = app.details?.gaps ?? []
  const jd = app.details?.jobAnalysis as Record<string, unknown> | undefined

  if (!suit) {
    return (
      <div className="card">
        <div className="empty-state" style={{ minHeight: 240 }}>
          <ZapIcon size={40} className="empty-state-icon" />
          <h3>No analysis yet</h3>
          <p>Click <strong>Analyze Job</strong> to run AI-powered suitability and gap analysis.</p>
        </div>
      </div>
    )
  }

  const metrics: [string, number, string][] = [
    ['Technical', suit.technical, 'var(--accent)'],
    ['Research',  suit.research,  'var(--teal)'],
    ['Leadership', suit.leadership, 'var(--warning)'],
    ['Communication', suit.communication, 'var(--success)'],
  ]

  return (
    <div className="flex flex-col gap-16 fade-in">
      {/* Overall + metrics */}
      <div className="card">
        <div className="card-header"><BarChartIcon size={16} color="var(--accent-light)" /><span className="card-title">Suitability Analysis</span></div>
        <div className="card-body">
          <div className="flex gap-24 items-center flex-wrap">
            <ScoreRing value={suit.overallMatch} size={100} />
            <div className="flex-1 flex flex-col gap-12">
              {metrics.map(([label, val, color]) => (
                <div key={label} className="flex flex-col gap-6">
                  <div className="flex justify-between">
                    <span className="text-sm text-secondary">{label}</span>
                    <span className="text-sm font-semibold" style={{ color }}>{val}%</span>
                  </div>
                  <ProgressBar value={val} color={color} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><CheckCircleIcon size={15} color="var(--success)" /><span className="card-title">Strengths</span></div>
          <div className="card-body flex flex-col gap-10">
            {suit.strengths.map((s, i) => (
              <div key={i}>
                <div className="flex gap-6 items-center">
                  <CheckCircleIcon size={13} color="var(--success)" />
                  <strong className="text-sm">{s.title}</strong>
                </div>
                <p className="text-xs text-secondary" style={{ marginTop: 3, paddingLeft: 19 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><AlertTriangleIcon size={15} color="var(--warning)" /><span className="card-title">Gaps / Weaknesses</span></div>
          <div className="card-body flex flex-col gap-10">
            {suit.weaknesses.map((w, i) => (
              <div key={i}>
                <div className="flex gap-6 items-center">
                  <AlertTriangleIcon size={13} color="var(--warning)" />
                  <strong className="text-sm">{w.title}</strong>
                </div>
                <p className="text-xs text-secondary" style={{ marginTop: 3, paddingLeft: 19 }}>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gap Repair Roadmap */}
      {gaps.length > 0 && (
        <div className="card">
          <div className="card-header"><ZapIcon size={15} color="var(--warning)" /><span className="card-title">Gap Repair Roadmap</span></div>
          <div className="card-body grid-2">
            {gaps.map((g, i) => (
              <div key={i} className="gap-card">
                <div className="gap-header">
                  <span className="gap-skill">{g.skill}</span>
                  <div className="gap-meta">
                    <span className={`difficulty-badge ${g.difficulty?.toLowerCase()}`}>{g.difficulty}</span>
                    <span className="impact-badge">Impact: {g.impact}</span>
                  </div>
                </div>
                <div className="text-xs text-muted">⏱ {g.effort}</div>
                <div className="gap-resources">
                  {g.resources?.map((r, j) => <div key={j} className="gap-resource">{r}</div>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Job Analysis Details */}
      {jd && (
        <div className="card">
          <div className="card-header"><SearchIcon size={15} color="var(--teal)" /><span className="card-title">Extracted Job Requirements</span></div>
          <div className="card-body flex flex-col gap-12">
{Array.isArray(jd.skills) && (jd.skills as { name: string; level: number }[]).length > 0 && (
              <div>
                <h4 className="text-sm" style={{ marginBottom: 8, color: 'var(--text-secondary)' }}>Required Skills</h4>
                <div className="flex flex-wrap gap-8">
                  {(jd.skills as { name: string; level: number }[]).map((s, i) => (
                    <div key={i} className="flex items-center gap-6 keyword-tag neutral">
                      <span>{s.name}</span>
                      <div className="skill-level-dots">
                        {[1,2,3,4,5].map(n => <div key={n} className={`skill-dot ${n <= s.level ? 'filled' : ''}`} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(jd.responsibilities as string[] | undefined)?.length && (
              <div>
                <h4 className="text-sm" style={{ marginBottom: 8, color: 'var(--text-secondary)' }}>Responsibilities</h4>
                <div className="flex flex-col gap-6">
                  {(jd.responsibilities as string[]).map((r, i) => (
                    <div key={i} className="text-sm text-secondary" style={{ display: 'flex', gap: 8 }}>
                      <ChevronRightIcon size={14} color="var(--accent-light)" style={{ flexShrink: 0, marginTop: 2 }} />
                      {r}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {typeof jd.hiddenRequirements === 'string' && jd.hiddenRequirements && (
              <div className="card" style={{ background: 'var(--warning-bg)', borderColor: 'rgba(245,158,11,0.3)' }}>
                <div className="card-body">
                  <div className="flex gap-8 items-center text-sm">
                    <AlertTriangleIcon size={14} color="var(--warning)" />
                    <strong style={{ color: 'var(--warning)' }}>Hidden Requirement:</strong>
                    <span className="text-secondary">{jd.hiddenRequirements}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── ATS Tab ───────────────────────────────────────────────────────────────────

function ATSTab({ app }: { app: AppDetail }) {
  const ats = app.resume_suggestions

  if (!ats) {
    return (
      <div className="card">
        <div className="empty-state" style={{ minHeight: 240 }}>
          <TargetIcon size={40} className="empty-state-icon" />
          <h3>No ATS data yet</h3>
          <p>Run <strong>Analyze Job</strong> to scan your resume against this job description.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-16 fade-in">
      {/* Score + match rate */}
      <div className="grid-2">
        <div className="card card-accent">
          <div className="card-header"><TargetIcon size={15} color="var(--accent-light)" /><span className="card-title">ATS Score</span></div>
          <div className="card-body flex items-center gap-20">
            <ScoreRing value={ats.score} size={90} />
            <div className="flex flex-col gap-8 flex-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Keyword Match Rate</span>
                <strong className="text-accent">{ats.keywords.matchRate}%</strong>
              </div>
              <ProgressBar value={ats.keywords.matchRate} />
              <div className="flex justify-between text-sm">
                <span className="text-muted">Keywords Found</span>
                <strong className="text-success">{ats.keywords.found.length}</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Keywords Missing</span>
                <strong className="text-danger">{ats.keywords.missing.length}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><SearchIcon size={15} color="var(--teal)" /><span className="card-title">Keywords</span></div>
          <div className="card-body flex flex-col gap-10">
            <div>
              <p className="text-xs text-muted" style={{ marginBottom: 6 }}>Found in resume</p>
              <div className="flex flex-wrap gap-6">
                {ats.keywords.found.map(k => <span key={k} className="keyword-tag found">{k}</span>)}
              </div>
            </div>
            {ats.keywords.missing.length > 0 && (
              <div>
                <p className="text-xs text-muted" style={{ marginBottom: 6 }}>Missing — consider adding</p>
                <div className="flex flex-wrap gap-6">
                  {ats.keywords.missing.map(k => <span key={k} className="keyword-tag missing">{k}</span>)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ordering alert */}
      {ats.orderingAlert && (
        <div className="card" style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'var(--warning-bg)' }}>
          <div className="card-body flex gap-10 items-center">
            <AlertTriangleIcon size={16} color="var(--warning)" />
            <span className="text-sm" style={{ color: 'var(--warning)' }}>{ats.orderingAlert}</span>
          </div>
        </div>
      )}

      {/* Weak bullets */}
      {ats.weakBullets.length > 0 && (
        <div className="card">
          <div className="card-header"><AlertTriangleIcon size={15} color="var(--warning)" /><span className="card-title">Weak Bullet Points</span></div>
          <div className="card-body flex flex-col gap-12">
            {ats.weakBullets.map((b, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <p className="text-sm" style={{ color: 'var(--text-primary)', fontStyle: 'italic', marginBottom: 4 }}>"{b.original}"</p>
                <div className="flex flex-col gap-4" style={{ marginBottom: 6 }}>
                  {b.issues.map((iss, j) => (
                    <div key={j} className="flex gap-6 items-center text-xs text-danger">
                      <XCircleIcon size={11} />{iss}
                    </div>
                  ))}
                </div>
                <div className="flex gap-6 items-center text-xs text-success">
                  <CheckCircleIcon size={11} />{b.suggestion}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unused projects */}
      {(ats.unusedProjects?.length ?? 0) > 0 && (
        <div className="card">
          <div className="card-header"><SparklesIcon size={15} color="var(--teal)" /><span className="card-title">Projects to Highlight</span></div>
          <div className="card-body flex flex-col gap-10">
            {ats.unusedProjects!.map((p, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <strong className="text-sm">{p.title}</strong>
                <p className="text-xs text-muted" style={{ marginTop: 3 }}>{p.reason}</p>
                <div className="flex flex-wrap gap-4" style={{ marginTop: 6 }}>
                  {p.matchingKeywords.map(k => <span key={k} className="keyword-tag found">{k}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Research Tab ──────────────────────────────────────────────────────────────

function ResearchTab({ app }: { app: AppDetail }) {
  const rm = app.details?.researchMatcher

  if (!rm) {
    return (
      <div className="card">
        <div className="empty-state" style={{ minHeight: 240 }}>
          <BookOpenIcon size={40} className="empty-state-icon" />
          <h3>No research match yet</h3>
          <p>Run <strong>Analyze Job</strong> to compute publication and project alignment.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-16 fade-in">
      <div className="card">
        <div className="card-header"><BarChartIcon size={15} color="var(--teal)" /><span className="card-title">Field Alignment</span></div>
        <div className="card-body flex flex-col gap-10">
          {Object.entries(rm.alignment).map(([field, score]) => (
            <div key={field} className="alignment-row">
              <span className="alignment-label">{field}</span>
              <div className="alignment-bar-wrap">
                <div className="alignment-bar-fill" style={{ width: `${score}%` }} />
              </div>
              <span className="alignment-pct">{score}%</span>
            </div>
          ))}
        </div>
      </div>

      {rm.overlaps.length > 0 && (
        <div className="card">
          <div className="card-header"><BookOpenIcon size={15} color="var(--accent-light)" /><span className="card-title">Publication Overlaps</span></div>
          <div className="card-body flex flex-col gap-12">
            {rm.overlaps.map((o, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <div className="flex items-center gap-8">
                  <span className="badge badge-analyzed">{o.similarity}% similar</span>
                  <span className="text-xs text-muted">{o.topic}</span>
                </div>
                <p className="text-sm" style={{ marginTop: 6 }}><strong>Your:</strong> {o.candidatePub}</p>
                <p className="text-sm text-muted"><strong>Prof:</strong> {o.professorPub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {rm.recommendations.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--teal-border)', background: 'var(--teal-bg)' }}>
          <div className="card-header"><SparklesIcon size={15} color="var(--teal)" /><span className="card-title">Recommendations</span></div>
          <div className="card-body flex flex-col gap-8">
            {rm.recommendations.map((r, i) => (
              <div key={i} className="flex gap-8 items-start text-sm">
                <ChevronRightIcon size={14} color="var(--teal)" style={{ flexShrink: 0, marginTop: 3 }} />
                <span style={{ color: 'var(--teal)' }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Cover Letter Tab ──────────────────────────────────────────────────────────

function CoverLetterTab({ app, notify, onRefresh }: { app: AppDetail; notify: (m: string, t?: string) => void; onRefresh: () => void }) {
  const [plan, setPlan] = useState<PlanItem[]>(app.cover_letter_plan ?? [])
  const [planning, setPlanning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [showRefine, setShowRefine] = useState(false)
  const [refineFeedback, setRefineFeedback] = useState('')
  const [changesSummary, setChangesSummary] = useState('')
  const [style, setStyle] = useState('industrial')
  const [clView, setClView] = useState<'letter' | 'audit' | 'feedback'>('letter')

  async function generatePlan() {
    setPlanning(true)
    try {
      const r = await fetch(`${API}/api/applications/${app.id}/plan`, { method: 'POST' })
      const d = await r.json()
      setPlan(d.plan)
      notify('Plan generated', 'success')
      await onRefresh()
    } catch { notify('Plan generation failed', 'error') }
    finally { setPlanning(false) }
  }

  async function generate() {
    if (plan.length === 0) { notify('Generate a plan first', 'error'); return }
    setGenerating(true)
    try {
      await fetch(`${API}/api/applications/${app.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, plan }),
      })
      notify('Cover letter generated!', 'success')
      await onRefresh()
    } catch { notify('Generation failed', 'error') }
    finally { setGenerating(false) }
  }

  async function refine() {
    if (!refineFeedback.trim()) { notify('Tell the AI what to change', 'error'); return }
    setRefining(true)
    try {
      const r = await fetch(`${API}/api/applications/${app.id}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: refineFeedback, style }),
      })
      const d = await r.json()
      setChangesSummary(d.changesSummary || '')
      setRefineFeedback('')
      setShowRefine(false)
      notify('Letter refined!', 'success')
      await onRefresh()
    } catch { notify('Refinement failed', 'error') }
    finally { setRefining(false) }
  }

  function exportLetter(fmt: string) {
    window.open(`${API}/api/applications/${app.id}/export/${fmt}`, '_blank')
  }

  const hasAnalysis = !!app.details?.suitability

  return (
    <div className="flex flex-col gap-16 fade-in">
      {/* Controls */}
      <div className="card">
        <div className="card-header"><FileTextIcon size={15} color="var(--accent-light)" /><span className="card-title">Cover Letter Generator</span></div>
        <div className="card-body flex flex-col gap-12">
          {!hasAnalysis && (
            <div className="card" style={{ background: 'var(--warning-bg)', borderColor: 'rgba(245,158,11,0.3)' }}>
              <div className="card-body flex gap-8 items-center text-sm" style={{ color: 'var(--warning)' }}>
                <AlertTriangleIcon size={14} /><span>Run <strong>Analyze Job</strong> first to enable cover letter generation.</span>
              </div>
            </div>
          )}

          <div className="flex gap-12 items-end flex-wrap">
            <div className="form-group flex-1">
              <label className="form-label">Writing Style</label>
              <select className="form-select" value={style} onChange={e => setStyle(e.target.value)}>
                {['industrial', 'academic', 'startup', 'phd', 'internship'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-secondary" onClick={generatePlan} disabled={!hasAnalysis || planning}>
              {planning ? <><div className="spinner" />Planning…</> : <><ClipboardListIcon size={14} />Generate Plan</>}
            </button>
            <button className="btn btn-primary" onClick={generate} disabled={!hasAnalysis || plan.length === 0 || generating}>
              {generating ? <><div className="spinner" />Generating…</> : <><SparklesIcon size={14} />Generate Letter</>}
            </button>
          </div>
        </div>
      </div>

      {/* Plan editor */}
      {plan.length > 0 && (
        <div className="card">
          <div className="card-header"><ClipboardListIcon size={15} color="var(--accent-light)" /><span className="card-title">Paragraph Plan</span></div>
          <div className="card-body flex flex-col gap-10">
            {plan.map((item, i) => (
              <div key={i} className="plan-item">
                <div className="plan-item-header">
                  <span className="plan-para-num">¶{item.paragraph}</span>
                  <input
                    className="form-input plan-topic"
                    value={item.topic}
                    onChange={e => setPlan(p => p.map((x, j) => j === i ? { ...x, topic: e.target.value } : x))}
                    style={{ background: 'transparent', border: 'none', padding: '0', fontWeight: 600 }}
                  />
                </div>
                <textarea
                  className="form-textarea plan-details"
                  value={item.details}
                  onChange={e => setPlan(p => p.map((x, j) => j === i ? { ...x, details: e.target.value } : x))}
                  style={{ minHeight: 60, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', paddingLeft: 8 }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cover letter view */}
      {app.cover_letter && (
        <div className="card fade-in">
          <div className="card-header">
            <ShieldCheckIcon size={15} color="var(--success)" />
            <span className="card-title">Generated Cover Letter</span>
            <div className="flex gap-6" style={{ marginLeft: 'auto' }}>
              {/* Refine button */}
              <button
                className="btn btn-teal btn-sm"
                onClick={() => setShowRefine(r => !r)}
                title="Tell AI what to change and regenerate"
              >
                <RefreshCcwIcon size={13} />Refine
              </button>
              {(['letter', 'audit', 'feedback'] as const).map(v => (
                <button key={v} className={`btn btn-ghost btn-sm ${clView === v ? 'active' : ''}`}
                  onClick={() => setClView(v)}
                  style={clView === v ? { background: 'var(--accent-bg)', color: 'var(--accent-light)', borderColor: 'var(--accent-border)' } : {}}>
                  {v === 'letter' ? 'Letter' : v === 'audit' ? 'Audit Trail' : 'Feedback'}
                </button>
              ))}
            </div>
          </div>

          {/* Inline Refine Panel */}
          {showRefine && (
            <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 20px', background: 'rgba(20,184,166,0.06)' }}>
              {changesSummary && (
                <div className="flex gap-8 items-center text-sm" style={{ marginBottom: 10, color: 'var(--teal)' }}>
                  <CheckCircleIcon size={14} />
                  <span>{changesSummary}</span>
                </div>
              )}
              <div className="form-group">
                <label className="form-label"><MessageSquareIcon size={12} style={{ display: 'inline', marginRight: 4 }} />What should change?</label>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 80 }}
                  placeholder="e.g. 'Too formal — use more casual tone. Add specific metrics to para 2. Remove the sentence about leadership skills.'"
                  value={refineFeedback}
                  onChange={e => setRefineFeedback(e.target.value)}
                />
              </div>
              <div className="flex gap-8" style={{ marginTop: 10 }}>
                <button className="btn btn-teal" onClick={refine} disabled={refining}>
                  {refining ? <><div className="spinner" />Refining…</> : <><SparklesIcon size={14} />Apply Feedback & Regenerate</>}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowRefine(false); setRefineFeedback('') }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="card-body">
            {clView === 'letter' && (
              <>
                <div className="cover-letter-box">{app.cover_letter}</div>
                <div className="flex gap-8" style={{ marginTop: 12 }}>
                  {[['txt','TXT'],['docx','DOCX'],['latex','LaTeX']].map(([fmt, label]) => (
                    <button key={fmt} className="btn btn-secondary btn-sm" onClick={() => exportLetter(fmt)}>
                      <DownloadIcon size={13} />{label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {clView === 'audit' && app.audit_trail && (
              <div className="flex flex-col">
                {app.audit_trail.map((item, i) => (
                  <div key={i} className="audit-item">
                    <div className={`audit-status-dot ${item.status}`} />
                    <div>
                      <p className="audit-sentence">{item.sentence}</p>
                      <p className="audit-source">Source: {item.source} · <span style={{ color: item.status === 'verified' ? 'var(--success)' : 'var(--danger)' }}>{item.status}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {clView === 'feedback' && app.feedback && (
              <div>
                <div className="grid-4" style={{ marginBottom: 16 }}>
                  {[
                    ['Naturalness', app.feedback.naturalness],
                    ['Grammar',     app.feedback.grammar],
                    ['Research Fit', app.feedback.researchFit],
                    ['Specificity', app.feedback.specificity],
                  ].map(([label, val]) => (
                    <div key={label as string} className="metric-card">
                      <div className="metric-value" style={{ color: (val as number) >= 9 ? 'var(--success)' : (val as number) >= 7 ? 'var(--warning)' : 'var(--danger)' }}>
                        {(val as number).toFixed(1)}
                      </div>
                      <div className="metric-label">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-12 items-center">
                  <div className="metric-card flex-1">
                    <div className="metric-value" style={{ color: 'var(--accent-light)' }}>{app.feedback.overall.toFixed(1)}</div>
                    <div className="metric-label">Overall Score</div>
                  </div>
                  <div className="metric-card flex-1">
                    <div className="metric-value" style={{ fontSize: '1.1rem', color: app.feedback.aiRisk === 'Low' ? 'var(--success)' : app.feedback.aiRisk === 'Medium' ? 'var(--warning)' : 'var(--danger)' }}>
                      {app.feedback.aiRisk}
                    </div>
                    <div className="metric-label">AI Detection Risk</div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE VIEW
// ══════════════════════════════════════════════════════════════════════════════

function ProfileView({ notify }: { notify: (m: string, t?: string) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [showPasteText, setShowPasteText] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [parsingText, setParsingText] = useState(false)

  useEffect(() => {
    fetch(`${API}/api/profile`)
      .then(r => r.json())
      .then(d => setProfile(d && d.resume_text !== undefined ? d : null))
      .catch(() => setProfile(null))
  }, [])

  async function save() {
    if (!profile) return
    setSaving(true)
    try {
      await fetch(`${API}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      notify('Profile saved', 'success')
    } catch { notify('Save failed', 'error') }
    finally { setSaving(false) }
  }

  async function uploadPDF(file: File) {
    if (!file.name.endsWith('.pdf')) { notify('Only PDF files are supported', 'error'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`${API}/api/profile/upload-resume`, { method: 'POST', body: fd })
      const d = await r.json()
      setProfile({ resume_text: d.resume_text, parsed_profile: d.parsed_profile })
      notify('AI parsed your resume — check the fields below', 'success')
    } catch { notify('Upload failed', 'error') }
    finally { setUploading(false) }
  }

  async function parseResumeText() {
    if (!pasteText.trim()) { notify('Paste your resume text first', 'error'); return }
    setParsingText(true)
    try {
      const r = await fetch(`${API}/api/profile/parse-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: pasteText }),
      })
      const d = await r.json()
      setProfile(p => p ? { ...p, parsed_profile: d.parsed_profile, resume_text: pasteText } : null)
      setShowPasteText(false)
      setPasteText('')
      notify('AI parsed your resume — check the fields below', 'success')
    } catch { notify('Parsing failed', 'error') }
    finally { setParsingText(false) }
  }

  if (!profile) return <div className="card"><div className="loading-overlay"><div className="spinner spinner-lg" /><span>Loading profile…</span></div></div>

  const pp = profile.parsed_profile

  return (
    <div className="flex flex-col gap-20 fade-in">
      <div className="flex items-center justify-between">
        <h2>My Profile</h2>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={15} />Save Profile</>}
        </button>
      </div>

      <div className="split-layout-wide">
        {/* Left: personal + skills */}
        <div className="flex flex-col gap-16">
          {/* PDF Upload */}
          <div
            className={`upload-zone ${drag ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) uploadPDF(f) }}
            onClick={() => document.getElementById('pdf-upload')?.click()}
          >
            <input id="pdf-upload" type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadPDF(f) }} />
            {uploading
              ? <><div className="spinner spinner-lg" style={{ margin: '0 auto 8px' }} /><p className="text-sm text-muted">AI is parsing your resume…</p></>
              : <><SparklesIcon size={24} color="var(--accent-light)" style={{ margin: '0 auto 8px' }} /><p className="text-sm text-muted">Drop PDF here or click to upload</p><p className="text-xs text-muted" style={{ marginTop: 4 }}>AI extracts name, email, skills, projects, publications</p></>}
          </div>

          {/* Paste text alternative */}
          <div style={{ textAlign: 'center', marginTop: -4 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowPasteText(v => !v)}
              style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
            >
              <ClipboardPasteIcon size={13} />
              {showPasteText ? 'Hide' : 'No PDF? Paste resume text instead'}
            </button>
          </div>

          {showPasteText && (
            <div className="card card-accent fade-in">
              <div className="card-header"><SparklesIcon size={15} color="var(--accent-light)" /><span className="card-title">AI Parse from Text</span></div>
              <div className="card-body flex flex-col gap-10">
                <p className="text-sm text-secondary">Paste your resume text below. AI will extract all fields automatically.</p>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 200 }}
                  placeholder="Paste your full resume text here…"
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                />
                <button className="btn btn-primary" onClick={parseResumeText} disabled={parsingText}>
                  {parsingText ? <><div className="spinner" />AI is parsing…</> : <><SparklesIcon size={14} />Extract Profile with AI</>}
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header"><UserIcon size={15} color="var(--accent-light)" /><span className="card-title">Personal Info</span></div>
            <div className="card-body flex flex-col gap-10">
{[
                ['name',  'Full Name',    'Dr. Thousi Yousi'],
                ['email', 'Email',        'yousi@example.com'],
                ['phone', 'Phone',        '+49 123 456789'],
              ].map(([k, label, ph]) => (
                <div key={k} className="form-group">
                  <label className="form-label">{label}</label>
                  <input className="form-input" placeholder={ph}
                    value={(pp as unknown as Record<string, string>)[k] ?? ''}
                    onChange={e => setProfile(p => p ? {
                      ...p, parsed_profile: { ...p.parsed_profile, [k]: e.target.value }
                    } : p)} />
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Career Goals</label>
                <textarea className="form-textarea" placeholder="e.g. Robotics researcher specializing in…"
                  value={pp.career_goals ?? ''}
                  onChange={e => setProfile(p => p ? {
                    ...p, parsed_profile: { ...p.parsed_profile, career_goals: e.target.value }
                  } : p)} style={{ minHeight: 80 }} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><CpuIcon size={15} color="var(--teal)" /><span className="card-title">Skills</span></div>
            <div className="card-body flex flex-col gap-8">
              <div className="flex flex-wrap gap-6">
                {pp.skills.map((s, i) => (
                  <div key={i} className="keyword-tag neutral" style={{ cursor: 'pointer', gap: 6 }}>
                    {s}
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, lineHeight: 1 }}
                      onClick={() => setProfile(p => p ? {
                        ...p, parsed_profile: { ...p.parsed_profile, skills: p.parsed_profile.skills.filter((_, j) => j !== i) }
                      } : p)}>×</button>
                  </div>
                ))}
              </div>
              <SkillAdder onAdd={skill => setProfile(p => p ? {
                ...p, parsed_profile: { ...p.parsed_profile, skills: [...p.parsed_profile.skills, skill] }
              } : p)} />
            </div>
          </div>
        </div>

        {/* Right: projects + publications + resume */}
        <div className="flex flex-col gap-16">
          <div className="card">
            <div className="card-header"><ZapIcon size={15} color="var(--warning)" /><span className="card-title">Projects ({pp.projects.length})</span></div>
            <div className="card-body flex flex-col gap-12">
              {pp.projects.map((proj, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div className="flex items-center justify-between">
                    <input className="form-input" value={proj.title}
                      onChange={e => setProfile(p => p ? {
                        ...p, parsed_profile: {
                          ...p.parsed_profile,
                          projects: p.parsed_profile.projects.map((x, j) => j === i ? { ...x, title: e.target.value } : x)
                        }
                      } : p)}
                      style={{ fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', marginBottom: 6 }} />
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => setProfile(p => p ? {
                      ...p, parsed_profile: { ...p.parsed_profile, projects: p.parsed_profile.projects.filter((_, j) => j !== i) }
                    } : p)}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <textarea className="form-textarea" value={proj.description}
                    onChange={e => setProfile(p => p ? {
                      ...p, parsed_profile: {
                        ...p.parsed_profile,
                        projects: p.parsed_profile.projects.map((x, j) => j === i ? { ...x, description: e.target.value } : x)
                      }
                    } : p)}
                    style={{ minHeight: 60, marginBottom: 6 }} />
                  <div className="flex flex-wrap gap-4">
                    {proj.technologies.map(t => <span key={t} className="keyword-tag neutral">{t}</span>)}
                  </div>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setProfile(p => p ? {
                ...p, parsed_profile: {
                  ...p.parsed_profile,
                  projects: [...p.parsed_profile.projects, { title: 'New Project', technologies: [], description: '' }]
                }
              } : p)}>
                <PlusIcon size={13} />Add Project
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><BookOpenIcon size={15} color="var(--accent-light)" /><span className="card-title">Publications</span></div>
            <div className="card-body flex flex-col gap-12">
              {pp.publications.map((pub, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div className="flex items-center justify-between">
                    <input className="form-input" value={pub.title}
                      onChange={e => setProfile(p => p ? {
                        ...p, parsed_profile: {
                          ...p.parsed_profile,
                          publications: p.parsed_profile.publications.map((x, j) => j === i ? { ...x, title: e.target.value } : x)
                        }
                      } : p)}
                      style={{ fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', marginBottom: 6 }} />
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => setProfile(p => p ? {
                      ...p, parsed_profile: { ...p.parsed_profile, publications: p.parsed_profile.publications.filter((_, j) => j !== i) }
                    } : p)}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <div className="grid-2" style={{ gap: 8, marginBottom: 6 }}>
                    <input className="form-input" placeholder="Authors" value={pub.authors}
                      onChange={e => setProfile(p => p ? {
                        ...p, parsed_profile: {
                          ...p.parsed_profile,
                          publications: p.parsed_profile.publications.map((x, j) => j === i ? { ...x, authors: e.target.value } : x)
                        }
                      } : p)} />
                    <input className="form-input" placeholder="Journal / Venue" value={pub.journal}
                      onChange={e => setProfile(p => p ? {
                        ...p, parsed_profile: {
                          ...p.parsed_profile,
                          publications: p.parsed_profile.publications.map((x, j) => j === i ? { ...x, journal: e.target.value } : x)
                        }
                      } : p)} />
                  </div>
                  <textarea className="form-textarea" value={pub.abstract}
                    onChange={e => setProfile(p => p ? {
                      ...p, parsed_profile: {
                        ...p.parsed_profile,
                        publications: p.parsed_profile.publications.map((x, j) => j === i ? { ...x, abstract: e.target.value } : x)
                      }
                    } : p)}
                    style={{ minHeight: 60 }} />
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setProfile(p => p ? {
                ...p, parsed_profile: {
                  ...p.parsed_profile,
                  publications: [...p.parsed_profile.publications, { title: 'New Publication', authors: '', journal: '', year: new Date().getFullYear(), abstract: '' }]
                }
              } : p)}>
                <PlusIcon size={13} />Add Publication
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkillAdder({ onAdd }: { onAdd: (s: string) => void }) {
  const [val, setVal] = useState('')
  return (
    <div className="flex gap-6">
      <input className="form-input flex-1" placeholder="Add skill (e.g. ROS2)" value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal('') } }} />
      <button className="btn btn-secondary btn-sm" onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal('') } }}>
        <PlusIcon size={14} />Add
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS VIEW
// ══════════════════════════════════════════════════════════════════════════════

function SettingsView({ notify, onSaved }: { notify: (m: string, t?: string) => void; onSaved: (s: Settings) => void }) {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')
  // Write-only key edits: newly typed keys (replacement) and removals by index.
  const [newGemini, setNewGemini] = useState<string[]>([])
  const [newNim, setNewNim] = useState<string[]>([])
  const [remGemini, setRemGemini] = useState<number[]>([])
  const [remNim, setRemNim] = useState<number[]>([])

  useEffect(() => {
    fetch(`${API}/api/settings`).then(r => r.json()).then(setS)
  }, [])

  async function save() {
    if (!s) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        gemini_models: s.gemini_models,
        nim_models: s.nim_models,
        nim_base_url: s.nim_base_url,
        ollama_enabled: s.ollama_enabled,
        ollama_base_url: s.ollama_base_url,
        ollama_model: s.ollama_model,
        active_provider: s.active_provider,
        forbidden_phrases: s.forbidden_phrases,
        tone_settings: s.tone_settings,
      }
      if (newGemini.some(k => k.trim())) body.gemini_api_keys = newGemini
      if (newNim.some(k => k.trim())) body.nim_api_keys = newNim
      if (remGemini.length) body.gemini_remove = remGemini
      if (remNim.length) body.nim_remove = remNim

      const r = await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      onSaved(d.settings ?? s)
      setNewGemini([])
      setNewNim([])
      setRemGemini([])
      setRemNim([])
      notify('Settings saved successfully', 'success')
    } catch { notify('Failed to save settings', 'error') }
    finally { setSaving(false) }
  }

  if (!s) return <div className="card"><div className="loading-overlay"><div className="spinner spinner-lg" /><span>Loading settings…</span></div></div>

  return (
    <div className="flex flex-col gap-24 fade-in">
      <div className="flex items-center justify-between">
        <h2>Settings</h2>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={15} />Save All</>}
        </button>
      </div>

      {/* Active Provider */}
      <div className="card card-accent">
        <div className="card-header"><CpuIcon size={15} color="var(--accent-light)" /><span className="card-title">Active LLM Provider</span></div>
        <div className="card-body flex gap-10">
          {(['gemini', 'nim', 'ollama'] as const).map(p => (
            <button key={p}
              className={`btn flex-1 ${s.active_provider === p ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setS(x => x ? { ...x, active_provider: p } : x)}>
              {p === 'gemini' ? '🧠 Google Gemini' : p === 'nim' ? '⚡ NVIDIA NIM' : '🦙 Ollama (Local)'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Gemini */}
        <div className="card">
          <div className="card-header"><KeyIcon size={15} color="var(--accent-light)" /><span className="card-title">Google Gemini</span></div>
          <div className="card-body settings-section">
            <p className="text-xs text-muted">Add multiple API keys — rotated automatically when rate limits are hit.</p>

            <div className="settings-section-title">Stored Keys</div>
            <div className="key-list">
              {(s.keyInfo?.gemini ?? []).map(k => (
                <div key={k.index} className="key-row">
                  <span className="key-mask">{k.masked}</span>
                  <button className="btn btn-danger btn-icon btn-sm" title="Remove this stored key"
                    onClick={() => setRemGemini(r => r.includes(k.index) ? r : [...r, k.index])}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              {newGemini.map((k, i) => (
                <div key={`new-${i}`} className="key-row">
                  <input className="form-input flex-1" type="password" value={k} placeholder="AIza..." autoComplete="new-password"
                    onChange={e => setNewGemini(v => v.map((x, j) => j === i ? e.target.value : x))} />
                  <button className="btn btn-danger btn-icon btn-sm"
                    onClick={() => setNewGemini(v => v.filter((_, j) => j !== i))}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setNewGemini(v => [...v, ''])}>
                <PlusIcon size={13} />Add New Key
              </button>
            </div>
            {remGemini.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--danger)', marginTop: 6 }}>
                {remGemini.length} stored key(s) will be removed on save.
              </p>
            )}
            <p className="form-hint">Keys are encrypted and stored server-side. They are never shown again — save new keys to replace existing ones.</p>

            <div className="settings-section-title">Models to Rotate Through</div>
            <div className="key-list">
              {s.gemini_models.map((m, i) => (
                <div key={i} className="key-row">
                  <input className="form-input flex-1 font-mono" value={m}
                    onChange={e => setS(x => x ? { ...x, gemini_models: x.gemini_models.map((v, j) => j === i ? e.target.value : v) } : x)} />
                  <button className="btn btn-danger btn-icon btn-sm"
                    onClick={() => setS(x => x ? { ...x, gemini_models: x.gemini_models.filter((_, j) => j !== i) } : x)}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setS(x => x ? { ...x, gemini_models: [...x.gemini_models, 'gemini-1.5-flash'] } : x)}>
                <PlusIcon size={13} />Add Model
              </button>
            </div>
            <p className="form-hint">Models are tried in order. On rate-limit, automatically advances to next key/model pair.</p>
          </div>
        </div>

        {/* NVIDIA NIM */}
        <div className="card">
          <div className="card-header"><ServerIcon size={15} color="var(--teal)" /><span className="card-title">NVIDIA NIM</span></div>
          <div className="card-body settings-section">
            <p className="text-xs text-muted">Add NIM API keys from <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>build.nvidia.com <ExternalLinkIcon size={11} style={{ display: 'inline' }} /></a></p>

            <div className="settings-section-title">Stored Keys</div>
            <div className="key-list">
              {(s.keyInfo?.nim ?? []).map(k => (
                <div key={k.index} className="key-row">
                  <span className="key-mask">{k.masked}</span>
                  <button className="btn btn-danger btn-icon btn-sm" title="Remove this stored key"
                    onClick={() => setRemNim(r => r.includes(k.index) ? r : [...r, k.index])}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              {newNim.map((k, i) => (
                <div key={`new-${i}`} className="key-row">
                  <input className="form-input flex-1" type="password" value={k} placeholder="nvapi-..." autoComplete="new-password"
                    onChange={e => setNewNim(v => v.map((x, j) => j === i ? e.target.value : x))} />
                  <button className="btn btn-danger btn-icon btn-sm"
                    onClick={() => setNewNim(v => v.filter((_, j) => j !== i))}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setNewNim(v => [...v, ''])}>
                <PlusIcon size={13} />Add New Key
              </button>
            </div>
            {remNim.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--danger)', marginTop: 6 }}>
                {remNim.length} stored key(s) will be removed on save.
              </p>
            )}
            <p className="form-hint">Keys are encrypted and stored server-side. They are never shown again — save new keys to replace existing ones.</p>

            <div className="settings-section-title">NIM Models</div>
            <div className="key-list">
              {s.nim_models.map((m, i) => (
                <div key={i} className="key-row">
                  <input className="form-input flex-1 font-mono" value={m}
                    onChange={e => setS(x => x ? { ...x, nim_models: x.nim_models.map((v, j) => j === i ? e.target.value : v) } : x)} />
                  <button className="btn btn-danger btn-icon btn-sm"
                    onClick={() => setS(x => x ? { ...x, nim_models: x.nim_models.filter((_, j) => j !== i) } : x)}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setS(x => x ? { ...x, nim_models: [...x.nim_models, 'meta/llama-3.1-8b-instruct'] } : x)}>
                <PlusIcon size={13} />Add Model
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Base URL</label>
              <input className="form-input font-mono" value={s.nim_base_url}
                onChange={e => setS(x => x ? { ...x, nim_base_url: e.target.value } : x)} />
              <span className="form-hint">Default: https://integrate.api.nvidia.com/v1</span>
            </div>
          </div>
        </div>

        {/* Ollama */}
        <div className="card">
          <div className="card-header"><ServerIcon size={15} color="var(--text-muted)" /><span className="card-title">Ollama (Local LLM)</span></div>
          <div className="card-body settings-section">
            <div className="flex items-center justify-between" style={{ padding: '8px 0' }}>
              <span className="form-label">Enable Ollama</span>
              <button
                className={`btn btn-sm ${s.ollama_enabled ? 'btn-success' : 'btn-ghost'}`}
                onClick={() => setS(x => x ? { ...x, ollama_enabled: !x.ollama_enabled } : x)}>
                {s.ollama_enabled ? <><CheckCircleIcon size={13} />Enabled</> : 'Disabled'}
              </button>
            </div>
            <div className="form-group">
              <label className="form-label">Ollama Base URL</label>
              <input className="form-input font-mono" value={s.ollama_base_url}
                onChange={e => setS(x => x ? { ...x, ollama_base_url: e.target.value } : x)} />
            </div>
            <div className="form-group">
              <label className="form-label">Model Name</label>
              <input className="form-input font-mono" placeholder="llama3, mistral, phi3…" value={s.ollama_model}
                onChange={e => setS(x => x ? { ...x, ollama_model: e.target.value } : x)} />
              <span className="form-hint">Run: <code style={{ color: 'var(--accent-light)', fontSize: '0.8rem' }}>ollama pull llama3</code></span>
            </div>
          </div>
        </div>

        {/* Cover Letter Memory */}
        <div className="card">
          <div className="card-header"><ShieldCheckIcon size={15} color="var(--warning)" /><span className="card-title">Cover Letter Memory</span></div>
          <div className="card-body settings-section">
            <div className="settings-section-title">Forbidden Phrases</div>
            <p className="text-xs text-muted">These clichéd phrases will be stripped from every generated letter.</p>
            <div className="flex flex-wrap gap-6">
              {s.forbidden_phrases.map((ph, i) => (
                <div key={i} className="keyword-tag missing" style={{ cursor: 'pointer' }}
                  onClick={() => setS(x => x ? { ...x, forbidden_phrases: x.forbidden_phrases.filter((_, j) => j !== i) } : x)}>
                  {ph} ×
                </div>
              ))}
            </div>
            <div className="flex gap-8">
              <input className="form-input flex-1" placeholder="e.g. I am passionate about" value={newPhrase}
                onChange={e => setNewPhrase(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newPhrase.trim()) { setS(x => x ? { ...x, forbidden_phrases: [...x.forbidden_phrases, newPhrase.trim()] } : x); setNewPhrase('') } }} />
              <button className="btn btn-warning btn-sm" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.35)' }}
                onClick={() => { if (newPhrase.trim()) { setS(x => x ? { ...x, forbidden_phrases: [...x.forbidden_phrases, newPhrase.trim()] } : x); setNewPhrase('') } }}>
                <PlusIcon size={13} />Add
              </button>
            </div>

            <div className="settings-section-title">Writing Style</div>
            <div className="form-group">
              <label className="form-label">Default Tone</label>
              <select className="form-select" value={s.tone_settings.writingStyle ?? 'professional'}
                onChange={e => setS(x => x ? { ...x, tone_settings: { ...x.tone_settings, writingStyle: e.target.value } } : x)}>
                {['professional', 'academic', 'concise', 'conversational'].map(o => (
                  <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-10">
              <input type="checkbox" id="active-voice" checked={s.tone_settings.activeVoice ?? true}
                onChange={e => setS(x => x ? { ...x, tone_settings: { ...x.tone_settings, activeVoice: e.target.checked } } : x)} />
              <label htmlFor="active-voice" className="form-label" style={{ cursor: 'pointer', marginBottom: 0 }}>Prefer active voice</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
