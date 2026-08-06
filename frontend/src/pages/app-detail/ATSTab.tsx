import { TargetIcon, SearchIcon, AlertTriangleIcon, XCircleIcon, CheckCircleIcon, SparklesIcon } from 'lucide-react'
import type { AppDetail } from '../../lib/types'
import { ScoreRing, ProgressBar } from '../../components/ui'

export function ATSTab({ app }: { app: AppDetail }) {
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
        <div className="card" style={{ borderColor: 'var(--warning-border)', background: 'var(--warning-bg)' }}>
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
