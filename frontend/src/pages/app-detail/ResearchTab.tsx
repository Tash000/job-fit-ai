import { BookOpenIcon, BarChartIcon, SparklesIcon, ChevronRightIcon } from 'lucide-react'
import type { AppDetail } from '../../lib/types'

export function ResearchTab({ app }: { app: AppDetail }) {
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
