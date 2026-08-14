import { useState, useEffect, useRef } from 'react'
import {
  FileTextIcon, ClipboardListIcon, SparklesIcon, ShieldCheckIcon,
  RefreshCcwIcon, CheckCircleIcon, MessageSquareIcon, DownloadIcon,
  AlertTriangleIcon,
} from 'lucide-react'
import { API_BASE as API } from '../../lib/api'
import type { AppDetail, Notify, PlanItem, Settings } from '../../lib/types'
import { freeLettersExhausted, isUsingFreeAllowance } from '../../lib/types'

export function CoverLetterTab({
  app, notify, onRefresh, onNeedSetup, settings,
}: {
  app: AppDetail
  notify: Notify
  onRefresh: () => void
  /** Open the setup wizard (missing key / free allowance used up). */
  onNeedSetup?: () => void
  /** Account settings for allowance-aware button states. */
  settings?: Settings | null
}) {
  const [plan, setPlan] = useState<PlanItem[]>(app.cover_letter_plan ?? [])
  const [planning, setPlanning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [showRefine, setShowRefine] = useState(false)
  const [refineFeedback, setRefineFeedback] = useState('')
  const [changesSummary, setChangesSummary] = useState('')
  const [style, setStyle] = useState('industrial')
  const [clView, setClView] = useState<'letter' | 'audit' | 'feedback'>('letter')
  // After "Generate Letter" completes, scroll the generated letter into view
  // instead of making the user hunt for it below the plan editor.
  const letterCardRef = useRef<HTMLDivElement | null>(null)
  const scrollAfterGenerate = useRef(false)

  useEffect(() => {
    if (scrollAfterGenerate.current && app.cover_letter) {
      scrollAfterGenerate.current = false
      setClView('letter')
      const t = window.setTimeout(() => {
        letterCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
      return () => window.clearTimeout(t)
    }
  }, [app.cover_letter])

  /** Surface setup/allowance errors and open the wizard when relevant. */
  function handleSetupError(r: Response, d: { detail?: unknown }) {
    if (r.status === 402 && (d?.detail as { reason?: string } | undefined)?.reason === 'free_limit') {
      const msg = (d?.detail as { message?: string } | undefined)?.message ?? 'Free allowance used up — add your own API key'
      notify(msg, 'error')
      onNeedSetup?.()
      return true
    }
    if (r.status === 503) {
      notify(typeof d?.detail === 'string' ? d.detail : 'AI provider not available', 'error')
      onNeedSetup?.()
      return true
    }
    return false
  }

  async function generatePlan() {
    setPlanning(true)
    try {
      const r = await fetch(`${API}/api/applications/${app.id}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style }),
      })
      const d = await r.json().catch(() => ({}))
      if (handleSetupError(r, d)) return
      if (!r.ok) { notify('Plan generation failed', 'error'); return }
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
      const r = await fetch(`${API}/api/applications/${app.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, plan }),
      })
      const d = await r.json().catch(() => ({}))
      if (handleSetupError(r, d)) return
      if (!r.ok) { notify('Generation failed', 'error'); return }
      notify('Cover letter generated!', 'success')
      scrollAfterGenerate.current = true
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
      const d = await r.json().catch(() => ({}))
      if (handleSetupError(r, d)) return
      if (!r.ok) { notify('Refinement failed', 'error'); return }
      setChangesSummary(d.changesSummary || '')
      setRefineFeedback('')
      setShowRefine(false)
      notify('Letter refined!', 'success')
      await onRefresh()
    } catch { notify('Refinement failed', 'error') }
    finally { setRefining(false) }
  }

  /**
   * Download the exported letter. We fetch the blob through the app's fetch
   * wrapper so the Supabase Bearer token is attached — a plain window.open()
   * cannot send the Authorization header and returns 401.
   */
  async function exportLetter(fmt: string) {
    try {
      const r = await fetch(`${API}/api/applications/${app.id}/export/${fmt}`)
      if (!r.ok) { notify('Download failed — please try again', 'error'); return }
      const blob = await r.blob()
      const disposition = r.headers.get('Content-Disposition') ?? ''
      const fileMatch = disposition.match(/filename="([^"]+)"/)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileMatch?.[1] ?? `CoverLetter_${app.company.replace(/\s+/g, '_')}.${fmt}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch { notify('Download failed — please try again', 'error') }
  }

  const hasAnalysis = !!app.details?.suitability
  // "Add your key" state: the account is on the free allowance and it is used up.
  const needKey = isUsingFreeAllowance(settings) && freeLettersExhausted(settings)

  return (
    <div className="flex flex-col gap-16 fade-in">
      {/* Controls */}
      <div className="card">
        <div className="card-header"><FileTextIcon size={15} color="var(--accent-light)" /><span className="card-title">Cover Letter Generator</span></div>
        <div className="card-body flex flex-col gap-12">
          {!hasAnalysis && (
            <div className="card" style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}>
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
            {needKey ? (
              <button className="btn btn-warning" onClick={() => onNeedSetup?.()}>
                <SparklesIcon size={14} />Add API key to generate
              </button>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={generatePlan} disabled={!hasAnalysis || planning}>
                  {planning ? <><div className="spinner" />Planning…</> : <><ClipboardListIcon size={14} />Generate Plan</>}
                </button>
                <button className="btn btn-primary" onClick={generate} disabled={!hasAnalysis || plan.length === 0 || generating}>
                  {generating ? <><div className="spinner" />Generating…</> : <><SparklesIcon size={14} />Generate Letter</>}
                </button>
              </>
            )}
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
        <div className="card fade-in" ref={letterCardRef} id="generated-cover-letter">
          <div className="card-header">
            <ShieldCheckIcon size={15} color="var(--success)" />
            <span className="card-title">Generated Cover Letter</span>
            <div className="flex gap-6" style={{ marginLeft: 'auto' }}>
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
            <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 20px', background: 'var(--teal-bg)' }}>
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
                  {[['txt', 'TXT'], ['pdf', 'PDF'], ['docx', 'DOCX'], ['latex', 'LaTeX']].map(([fmt, label]) => (
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
                    ['Grammar', app.feedback.grammar],
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
