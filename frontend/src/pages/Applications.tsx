import { useState, useEffect, useCallback } from 'react'
import {
  BriefcaseIcon, PlusIcon, TrashIcon, ClipboardPasteIcon, WandIcon,
  XCircleIcon, SparklesIcon, SaveIcon, ClipboardListIcon, TargetIcon,
} from 'lucide-react'
import { API_BASE as API } from '../lib/api'
import type { AppItem, Notify } from '../lib/types'
import { scoreClass, statusBadge } from '../lib/types'
import { ApplicationDetail } from './app-detail/ApplicationDetail'

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

interface ApplicationsViewProps {
  notify: Notify
  /** When the dashboard asks to open a specific application. */
  focusId?: number | null
  /** Increment to trigger the "New application" form from the dashboard. */
  newToken?: number
}

export function ApplicationsView({ notify, focusId, newToken }: ApplicationsViewProps) {
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

  // Dashboard navigation hooks
  useEffect(() => {
    if (focusId != null) setSelected(focusId)
  }, [focusId])

  useEffect(() => {
    if (newToken && newToken > 0) setCreating(true)
  }, [newToken])

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
            <h2>Applications</h2>
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
            <div className="app-list scroll-y" style={{ maxHeight: 'calc(100vh - 200px)' }}>
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
