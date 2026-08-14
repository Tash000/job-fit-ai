import { useState, useEffect, useCallback } from 'react'
import {
  ZapIcon, BarChartIcon, TargetIcon, BookOpenIcon, FileTextIcon,
  CheckCircleIcon, BookmarkIcon, BookmarkCheckIcon, ExternalLinkIcon,
  LinkIcon, PencilIcon,
} from 'lucide-react'
import { API_BASE as API } from '../../lib/api'
import type { AppDetail, Notify, Settings } from '../../lib/types'
import { statusBadge, appliedBadge, freeAnalysesExhausted, isUsingFreeAllowance } from '../../lib/types'
import { fmtDateTime } from '../../lib/dates'
import { ScoreRing, LoadingBlock } from '../../components/ui'
import { AnalysisTab } from './AnalysisTab'
import { ATSTab } from './ATSTab'
import { ResearchTab } from './ResearchTab'
import { CoverLetterTab } from './CoverLetterTab'

type DetailTab = 'analysis' | 'ats' | 'research' | 'coverletter'

export interface DuplicateInfo {
  id: number
  company: string
  position: string
}

/**
 * Detail view for a single application: header with score + analyze action,
 * and four tabbed views (Analysis, ATS, Research, Cover Letter).
 */
export function ApplicationDetail({
  id, notify, onRefreshList, onDuplicate, onNeedSetup, settings,
}: {
  id: number
  notify: Notify
  onRefreshList: () => void
  /** Called when analyzing reveals this job duplicates an existing one. */
  onDuplicate?: (dup: DuplicateInfo) => void
  /** Open the setup wizard (missing key / free allowance used up). */
  onNeedSetup?: () => void
  /** Account settings for setup/allowance-aware button states. */
  settings?: Settings | null
}) {
  const [app, setApp] = useState<AppDetail | null>(null)
  const [tab, setTab] = useState<DetailTab>('analysis')
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')

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
      const d = await r.json().catch(() => ({}))
      if (r.status === 409 && d?.detail?.reason === 'duplicate') {
        onDuplicate?.({ id: d.detail.existing_id, company: d.detail.existing_company, position: d.detail.existing_position })
        return
      }
      if (r.status === 402 && d?.detail?.reason === 'free_limit') {
        notify(d.detail.message ?? 'Free allowance used up — add your own API key', 'error')
        onNeedSetup?.()
        return
      }
      if (r.status === 400 && d?.detail?.reason === 'no_resume') {
        notify(d.detail.message ?? 'Upload your resume first', 'error')
        onNeedSetup?.()
        return
      }
      if (r.status === 503) {
        notify(typeof d?.detail === 'string' ? d.detail : 'AI provider not available', 'error')
        onNeedSetup?.()
        return
      }
      if (!r.ok) { notify('Analysis failed', 'error'); return }
      notify(`Analysis complete – Match: ${d.match_score}%`, 'success')
      await loadApp()
      await onRefreshList()
    } catch { notify('Analysis failed', 'error') }
    finally { setAnalyzing(false) }
  }

  /** Update a tracking flag (applied / follow-up / bookmarked / job link) via PATCH. */
  async function setFlag(patch: { applied?: boolean; follow_up?: boolean; bookmarked?: boolean; job_url?: string }) {
    await fetch(`${API}/api/applications/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await loadApp()
    await onRefreshList()
  }

  /** Save or clear the job posting link from the inline editor. */
  async function saveUrl() {
    const next = urlDraft.trim()
    await setFlag({ job_url: next })
    setEditingUrl(false)
    notify(next ? 'Job link saved' : 'Job link removed', 'success')
  }

  if (loading) return <LoadingBlock label="Loading application…" />
  if (!app) return null

  const hasAnalysis = !!app.details?.suitability
  const hasCL = !!app.cover_letter
  // "Add your key" state: the account is on the free allowance and it is used up.
  const needKey = isUsingFreeAllowance(settings) && freeAnalysesExhausted(settings)

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
              <div className="flex gap-8 items-center" style={{ flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>{app.company}</h2>
                {app.applied && <span className={appliedBadge()}>Applied</span>}
              </div>
              <p style={{ fontSize: '0.95rem', marginTop: 2 }}>{app.position}</p>
              <div className="flex gap-8 items-center" style={{ marginTop: 6 }}>
                <span className={statusBadge(app.status)}>{app.status}</span>
                {app.location && <span className="text-xs text-muted">{app.location}</span>}
              </div>
              {/* Discreet timestamps: created / last analyzed / applied */}
              <div className="app-timestamps">
                <span>Added {fmtDateTime(app.created_at)}</span>
                {app.analyzed_at && <span>· Last analyzed {fmtDateTime(app.analyzed_at)}</span>}
                {app.applied_date && <span>· Applied {app.applied_date}</span>}
              </div>
            </div>

            {/* Tracking controls — discreet, per-application */}
            <div className="flex gap-6 items-center">
              {app.job_url ? (
                <>
                  <a
                    className="btn btn-secondary btn-sm"
                    href={app.job_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open the job posting to apply"
                  >
                    <ExternalLinkIcon size={13} />Job site
                  </a>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Edit job link"
                    onClick={() => { setUrlDraft(app.job_url); setEditingUrl(true) }}
                  >
                    <PencilIcon size={14} />
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  title="Add the job posting link so you can jump back and apply"
                  onClick={() => { setUrlDraft(''); setEditingUrl(true) }}
                >
                  <LinkIcon size={13} />Add job link
                </button>
              )}
              <button
                className={`btn btn-sm ${app.applied ? 'btn-success' : 'btn-secondary'}`}
                onClick={() => void setFlag({ applied: !app.applied })}
                title={app.applied ? 'Mark as not applied' : 'I have applied for this job'}
              >
                {app.applied ? <><CheckCircleIcon size={13} />Applied</> : 'Mark applied'}
              </button>
              <button
                className={`led-btn ${app.follow_up ? 'led-on' : ''}`}
                title={app.follow_up ? 'Follow-up reminder on — check up on this job' : 'Remind me to follow up on this job'}
                onClick={() => void setFlag({ follow_up: !app.follow_up })}
              >
                <span className={`led-dot ${app.follow_up ? 'on' : ''}`} />
              </button>
              <button
                className={`btn btn-icon btn-sm ${app.bookmarked ? 'btn-success' : 'btn-ghost'}`}
                title={app.bookmarked ? 'Remove bookmark' : 'Bookmark for later'}
                onClick={() => void setFlag({ bookmarked: !app.bookmarked })}
              >
                {app.bookmarked ? <BookmarkCheckIcon size={15} /> : <BookmarkIcon size={15} />}
              </button>
            </div>

            {/* Inline editor for the job posting link */}
            {editingUrl && (
              <div className="flex gap-8 items-center" style={{ flexBasis: '100%' }}>
                <input
                  className="form-input flex-1"
                  type="url"
                  placeholder="https://company.com/careers/… — leave empty to remove the link"
                  value={urlDraft}
                  onChange={e => setUrlDraft(e.target.value)}
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={() => void saveUrl()}>
                  Save
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingUrl(false)}>Cancel</button>
              </div>
            )}

            {hasAnalysis && <ScoreRing value={app.match_score} size={80} />}
            {needKey ? (
              <button
                className="btn btn-warning"
                onClick={() => onNeedSetup?.()}
                title="Free analyses used — add your own Gemini API key to continue"
              >
                <ZapIcon size={15} />Add API key to analyze
              </button>
            ) : (
              <button
                className={`btn ${analyzing ? 'btn-ghost' : 'btn-primary'}`}
                onClick={analyze}
                disabled={analyzing}
              >
                {analyzing ? <><div className="spinner" />Analyzing…</> : <><ZapIcon size={15} />Analyze Job</>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {([
          ['analysis', 'Analysis', BarChartIcon],
          ['ats', 'ATS Score', TargetIcon],
          ['research', 'Research', BookOpenIcon],
          ['coverletter', 'Cover Letter', FileTextIcon],
        ] as [DetailTab, string, typeof BarChartIcon][]).map(([key, label, Icon]) => (
          <button
            key={key}
            className={`tab-btn ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} />{label}
            {key === 'coverletter' && hasCL && <CheckCircleIcon size={12} color="var(--success)" />}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'analysis' && <AnalysisTab app={app} />}
      {tab === 'ats' && <ATSTab app={app} />}
      {tab === 'research' && <ResearchTab app={app} />}
      {tab === 'coverletter' && <CoverLetterTab app={app} notify={notify} onRefresh={loadApp} onNeedSetup={onNeedSetup} settings={settings} />}
    </div>
  )
}
