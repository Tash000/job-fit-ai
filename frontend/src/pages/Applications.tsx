import { useState, useEffect, useCallback } from 'react'
import {
  BriefcaseIcon, PlusIcon, TrashIcon, ClipboardPasteIcon, WandIcon,
  XCircleIcon, SparklesIcon, SaveIcon, ClipboardListIcon, TargetIcon,
  BookmarkIcon, BookmarkCheckIcon, AlertTriangleIcon, ArchiveIcon,
} from 'lucide-react'
import { API_BASE as API } from '../lib/api'
import type { AppItem, Notify, Settings } from '../lib/types'
import { scoreClass, statusBadge, appliedBadge } from '../lib/types'
import { fmtDay } from '../lib/dates'
import { ApplicationDetail } from './app-detail/ApplicationDetail'

/** Mirrors backend/database.py:MAX_ANALYSES_PER_USER. */
const MAX_ANALYSES = 500

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
  notify: Notify
}) {
  const [raw, setRaw] = useState('')
  const [url, setUrl] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [scraping, setScraping] = useState(false)

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
      if (!r.ok) { notify(typeof d?.detail === 'string' ? d.detail : 'Extraction failed', 'error'); return }
      onExtracted(d)
      onClose()
      notify('Job details extracted by AI', 'success')
    } catch { notify('Extraction failed', 'error') }
    finally { setExtracting(false) }
  }

  /** Fetch the page from a URL, then extract fields from the page text. */
  async function scrape() {
    if (!url.trim()) { notify('Enter a job posting URL', 'error'); return }
    setScraping(true)
    try {
      const r = await fetch(`${API}/api/jobs/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const d = await r.json()
      if (!r.ok) { notify(typeof d?.detail === 'string' ? d.detail : 'Could not scrape that URL', 'error'); return }
      onExtracted(d)
      onClose()
      notify('Job details scraped from URL', 'success')
    } catch { notify('Scraping failed — try pasting the text instead', 'error') }
    finally { setScraping(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card fade-in modal-card" onClick={e => e.stopPropagation()}>
        <div className="card-header" style={{ padding: '16px 20px 0' }}>
          <WandIcon size={16} color="var(--accent-light)" />
          <span className="card-title">Smart Job Paste</span>
          <button className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <XCircleIcon size={16} />
          </button>
        </div>
        <div className="card-body flex flex-col gap-12">
          <p className="text-sm text-secondary">
            Paste the <strong>full job posting</strong> — or just its <strong>URL</strong>. Either way
            the company, position, location, and clean description are filled automatically.
          </p>

          {/* URL scrape option */}
          <div className="form-group">
            <label className="form-label">Scrape from URL</label>
            <div className="flex gap-8">
              <input
                className="form-input flex-1"
                type="url"
                placeholder="https://…/job-posting"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !scraping) void scrape() }}
              />
              <button className="btn btn-secondary" onClick={scrape} disabled={scraping}>
                {scraping ? <><div className="spinner" />Fetching…</> : <><SparklesIcon size={14} />Fetch & Fill</>}
              </button>
            </div>
            <span className="form-hint">Works for public job pages (LinkedIn, company sites, university boards). Login-walled pages may fail — paste the text instead.</span>
          </div>

          <div className="flex items-center gap-8" style={{ margin: '4px 0' }}>
            <span className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
            <span className="text-xs text-muted">or paste the text</span>
            <span className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
          </div>

          <div className="form-group">
            <label className="form-label">Raw Job Posting Text</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: 200 }}
              placeholder="Paste the entire job posting here — the more text, the better the extraction…"
              value={raw}
              onChange={e => setRaw(e.target.value)}
            />
          </div>
          <div className="flex gap-8">
            <button className="btn btn-primary flex-1" onClick={extract} disabled={extracting || scraping}>
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
// DUPLICATE JOB MODAL
// ══════════════════════════════════════════════════════════════════════════════

function DuplicateModal({
  dup,
  onOpen,
  onClose,
}: {
  dup: { id: number; company: string; position: string }
  onOpen: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card fade-in modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
        <div className="card-header" style={{ padding: '18px 20px 0' }}>
          <AlertTriangleIcon size={17} color="var(--warning)" />
          <span className="card-title">This job is already saved</span>
          <button className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <XCircleIcon size={16} />
          </button>
        </div>
        <div className="card-body flex flex-col gap-12">
          <p className="text-sm text-secondary">
            You already have <strong>{dup.company}</strong> — <strong>{dup.position}</strong> in your
            applications, with the same job description. No need to analyze it twice.
          </p>
          <div className="flex gap-8">
            <button className="btn btn-primary flex-1" onClick={onOpen}>
              <TargetIcon size={14} />Open existing application
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STORAGE LIMIT MODAL
// ══════════════════════════════════════════════════════════════════════════════

function LimitModal({
  info,
  onOpenOldest,
  onClose,
}: {
  info: { count: number; max: number; oldest: { id: number; company: string; position: string } | null }
  onOpenOldest: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card fade-in modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
        <div className="card-header" style={{ padding: '18px 20px 0' }}>
          <ArchiveIcon size={17} color="var(--danger)" />
          <span className="card-title">Storage space is full</span>
          <button className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <XCircleIcon size={16} />
          </button>
        </div>
        <div className="card-body flex flex-col gap-12">
          <p className="text-sm text-secondary">
            This account can hold up to <strong>{info.max} job analyses</strong>, and you've reached{' '}
            <strong>{info.count}/{info.max}</strong>. To analyze a new job, delete the oldest one first.
          </p>
          {info.oldest && (
            <div className="card" style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
              <div className="card-body" style={{ padding: '12px 16px' }}>
                <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Oldest saved job</div>
                <div className="app-company">{info.oldest.company}</div>
                <div className="app-position">{info.oldest.position}</div>
              </div>
            </div>
          )}
          <div className="flex gap-8">
            {info.oldest && (
              <button className="btn btn-warning flex-1" onClick={onOpenOldest}>
                <TrashIcon size={14} />Open oldest job to delete it
              </button>
            )}
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

interface ApplicationsViewProps {
  notify: Notify
  /** When the dashboard asks to open a specific application. */
  focusId?: number | null
  /** Increment to trigger the "New application" form from the dashboard. */
  newToken?: number
  /** Increment to open the Smart Paste modal directly (dashboard shortcut). */
  pasteToken?: number
  /** Open the "set up your account" wizard (missing key / free tier used up). */
  onNeedSetup?: () => void
  /** Account settings (setup state + free allowance) for button states. */
  settings?: Settings | null
}

type Filter = 'all' | 'applied' | 'bookmarked'

export function ApplicationsView({ notify, focusId, newToken, pasteToken, onNeedSetup, settings }: ApplicationsViewProps) {
  const [apps, setApps] = useState<AppItem[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [form, setForm] = useState({ company: '', position: '', location: '', description: '' })
  const [dup, setDup] = useState<{ id: number; company: string; position: string } | null>(null)
  const [limit, setLimit] = useState<{ count: number; max: number; oldest: { id: number; company: string; position: string } | null } | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

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

  // Dashboard navigation hooks
  useEffect(() => {
    if (focusId != null) setSelected(focusId)
  }, [focusId])

  useEffect(() => {
    if (newToken && newToken > 0) setCreating(true)
  }, [newToken])

  // Dashboard "Smart Paste" shortcut → open the paste modal directly.
  useEffect(() => {
    if (pasteToken && pasteToken > 0) {
      setCreating(false)
      setShowPaste(true)
    }
  }, [pasteToken])

  async function create() {
    if (!form.company || !form.position) { notify('Company and position are required', 'error'); return }
    const r = await fetch(`${API}/api/applications`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await r.json().catch(() => ({}))
    if (r.status === 409 && d?.detail?.reason === 'duplicate') {
      setDup({ id: d.detail.existing_id, company: d.detail.existing_company, position: d.detail.existing_position })
      return
    }
    if (r.status === 409 && d?.detail?.reason === 'limit') {
      setLimit({ count: d.detail.count, max: d.detail.max, oldest: d.detail.oldest })
      return
    }
    if (!r.ok) { notify(d?.detail?.message ?? 'Failed to create application', 'error'); return }
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

  async function patchFlags(id: number, patch: { applied?: boolean; follow_up?: boolean; bookmarked?: boolean }) {
    await fetch(`${API}/api/applications/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await load()
  }

  const filtered = apps.filter(a => filter === 'all' ? true : filter === 'applied' ? a.applied : a.bookmarked)

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
      {dup && (
        <DuplicateModal
          dup={dup}
          onOpen={() => { setSelected(dup.id); setDup(null) }}
          onClose={() => setDup(null)}
        />
      )}
      {limit && (
        <LimitModal
          info={limit}
          onOpenOldest={() => { setSelected(limit.oldest?.id ?? null); setLimit(null) }}
          onClose={() => setLimit(null)}
        />
      )}
      <div className="split-layout">
        <div className="flex flex-col gap-16">
          <div className="flex items-center justify-between flex-wrap" style={{ gap: 8 }}>
            <div>
              <h2>Applications</h2>
              <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                {apps.length} / {MAX_ANALYSES} analyses stored
              </p>
            </div>
            <div className="flex gap-6">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowPaste(true)}>
                <ClipboardPasteIcon size={14} />Smart Paste
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                <PlusIcon size={14} />New
              </button>
            </div>
          </div>

          {/* Storage meter */}
          <div className="usage-meter" title={`${apps.length} of ${MAX_ANALYSES} analyses used`}>
            <div className="usage-meter-fill" style={{ width: `${Math.min(100, (apps.length / MAX_ANALYSES) * 100)}%` }} />
          </div>

          {/* Filters */}
          {apps.length > 0 && (
            <div className="tabs" style={{ maxWidth: 360 }}>
              {([['all', 'All'], ['applied', 'Applied'], ['bookmarked', 'Bookmarked']] as [Filter, string][]).map(([k, label]) => (
                <button key={k} className={`tab-btn ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
                  {k === 'applied' ? '✓ ' : k === 'bookmarked' ? <BookmarkIcon size={12} style={{ display: 'inline', marginRight: 3 }} /> : null}
                  {label}
                </button>
              ))}
            </div>
          )}

          {creating && (
            <div className="card card-accent fade-in">
              <div className="card-header">
                <ClipboardListIcon size={16} color="var(--accent-light)" />
                <span className="card-title">New Application</span>
                <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowPaste(true)}>
                  <WandIcon size={13} />AI Fill from Job Post / URL
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

          {filtered.length === 0 && !creating ? (
            <div className="empty-state">
              <BriefcaseIcon size={40} className="empty-state-icon" />
              <h3>{apps.length === 0 ? 'No applications yet' : 'Nothing here'}</h3>
              <p>{apps.length === 0
                ? 'Click “New” to add your first job application'
                : 'No applications match this filter.'}</p>
            </div>
          ) : (
            <div className="app-list scroll-y" style={{ maxHeight: 'calc(100vh - 240px)' }}>
              {filtered.map(a => (
                <div
                  key={a.id}
                  className={`app-list-item ${selected === a.id ? 'selected' : ''}`}
                  onClick={() => setSelected(a.id)}
                >
                  <div className="app-company-logo">{a.company[0]}</div>
                  <div className="app-info">
                    <div className="app-info-line">
                      <span className="app-company">{a.company}</span>
                      {a.applied && <span className={appliedBadge()}>Applied</span>}
                    </div>
                    <div className="app-position">{a.position}</div>
                    <div className="app-info-line app-info-meta">
                      <span className={statusBadge(a.status)}>{a.status}</span>
                      {a.location && <span className="text-xs text-muted">{a.location}</span>}
                      <span className="text-xs text-muted">· Added {fmtDay(a.created_at)}</span>
                    </div>
                  </div>
                  <div className={`score-mini ${scoreClass(a.match_score)}`}>
                    {a.match_score > 0 ? `${a.match_score}` : '–'}
                  </div>
                  <div className="app-actions">
                    {/* Discreet follow-up reminder LED */}
                    <button
                      className={`led-btn ${a.follow_up ? 'led-on' : ''}`}
                      title={a.follow_up ? 'Follow-up reminder set — check up on this job' : 'Set a follow-up reminder'}
                      onClick={e => { e.stopPropagation(); void patchFlags(a.id, { follow_up: !a.follow_up }) }}
                    >
                      <span className={`led-dot ${a.follow_up ? 'on' : ''}`} />
                    </button>
                    <button
                      className={`btn btn-icon btn-sm ${a.bookmarked ? 'btn-success' : 'btn-ghost'}`}
                      title={a.bookmarked ? 'Remove bookmark' : 'Bookmark for later'}
                      onClick={e => { e.stopPropagation(); void patchFlags(a.id, { bookmarked: !a.bookmarked }) }}
                    >
                      {a.bookmarked ? <BookmarkCheckIcon size={14} /> : <BookmarkIcon size={14} />}
                    </button>
                    <button className="btn btn-danger btn-icon" onClick={e => { e.stopPropagation(); deleteApp(a.id) }}>
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right panel: detail ── */}
        <div>
          {selected
            ? <ApplicationDetail id={selected} notify={notify} onRefreshList={load} onDuplicate={setDup} onNeedSetup={onNeedSetup} settings={settings} />
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
