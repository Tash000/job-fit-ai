import { useState, useEffect, useCallback } from 'react'
import { ZapIcon, BarChartIcon, TargetIcon, BookOpenIcon, FileTextIcon, CheckCircleIcon } from 'lucide-react'
import { API_BASE as API } from '../../lib/api'
import type { AppDetail, Notify } from '../../lib/types'
import { statusBadge } from '../../lib/types'
import { ScoreRing, LoadingBlock } from '../../components/ui'
import { AnalysisTab } from './AnalysisTab'
import { ATSTab } from './ATSTab'
import { ResearchTab } from './ResearchTab'
import { CoverLetterTab } from './CoverLetterTab'

type DetailTab = 'analysis' | 'ats' | 'research' | 'coverletter'

/**
 * Detail view for a single application: header with score + analyze action,
 * and four tabbed views (Analysis, ATS, Research, Cover Letter).
 */
export function ApplicationDetail({ id, notify, onRefreshList }: { id: number; notify: Notify; onRefreshList: () => void }) {
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
      const d = await r.json()
      notify(`Analysis complete – Match: ${d.match_score}%`, 'success')
      await loadApp()
      await onRefreshList()
    } catch { notify('Analysis failed', 'error') }
    finally { setAnalyzing(false) }
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
