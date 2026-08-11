import { useState, useEffect, useCallback } from 'react'
import {
  ZapIcon, BarChartIcon, TargetIcon, BookOpenIcon, FileTextIcon,
  CheckCircleIcon, BookmarkIcon, BookmarkCheckIcon,
} from 'lucide-react'
import { API_BASE as API } from '../../lib/api'
import type { AppDetail, Notify } from '../../lib/types'
import { statusBadge, appliedBadge } from '../../lib/types'
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
  id, notify, onRefreshList, onDuplicate,
}: {
  id: number
  notify: Notify
  onRefreshList: () => void
  /** Called when analyzing reveals this job duplicates an existing one. */
  onDuplicate?: (dup: DuplicateInfo) => void
}) {
  const [app, setApp] = useState<AppDetail | null>(null)
  const [tab, setTab] = useState<DetailTab>('analysis')
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
      const d = await r.json().catch(() => ({}))
      if (r.status === 409 && d?.detail?.reason === 'duplicate') {
        onDuplicate?.({ id: d.detail.existing_id, company: d.detail.existing_company, position: d.detail.existing_position })
        return
      }
      if (!r.ok) { notify('Analysis failed', 'error'); return }
      notify(`Analysis complete – Match: ${d.match_score}%`, 'success')
      await loadApp()
      await onRefreshList()
    } catch { notify('Analysis failed', 'error') }
    finally { setAnalyzing(false) }
  }

  /** Update a tracking flag (applied / follow-up / bookmarked) via PATCH. */
  async function setFlag(patch: { applied?: boolean; follow_up?: boolean; bookmarked?: boolean }) {
    await fetch(`${API}/api/applications/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await loadApp()
    await onRefreshList()
  }

  if (loading) return <LoadingBlock label="Loading application…" />
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
      {tab === 'coverletter' && <CoverLetterTab app={app} notify={notify} onRefresh={loadApp} />}
    </div>
  )
}
