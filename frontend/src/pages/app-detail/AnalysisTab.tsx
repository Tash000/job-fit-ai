import { ZapIcon, BarChartIcon, CheckCircleIcon, AlertTriangleIcon, SearchIcon, ChevronRightIcon, ClockIcon } from 'lucide-react'
import type { AppDetail } from '../../lib/types'
import { ScoreRing, ProgressBar } from '../../components/ui'

export function AnalysisTab({ app }: { app: AppDetail }) {
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
    ['Research', suit.research, 'var(--teal)'],
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
                <div className="flex items-center gap-6 text-xs text-muted"><ClockIcon size={12} />{g.effort}</div>
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
                        {[1, 2, 3, 4, 5].map(n => <div key={n} className={`skill-dot ${n <= s.level ? 'filled' : ''}`} />)}
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
              <div className="card" style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}>
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
