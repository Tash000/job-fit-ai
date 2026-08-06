import { useEffect } from 'react'
import { CheckCircleIcon, XCircleIcon, ZapIcon } from 'lucide-react'

/** Animated circular score display. */
export function ScoreRing({ value, size = 80 }: { value: number; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const fill = circ * (1 - value / 100)
  const color = value >= 75 ? 'var(--success)' : value >= 50 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeDasharray={circ}
          strokeDashoffset={fill}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="score-ring-label">
        <div className="score-ring-value" style={{ fontSize: size * 0.22 }}>{value}</div>
        <div className="score-ring-sub">%</div>
      </div>
    </div>
  )
}

/** Horizontal progress bar with token-based color. */
export function ProgressBar({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  return (
    <div className="progress-bar-wrap">
      <div className="progress-bar-fill" style={{ width: `${value}%`, background: color }} />
    </div>
  )
}

/** Auto-dismissing toast notification. */
export function Toast({ msg, type, onClose }: { msg: string; type: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])
  const icon =
    type === 'success' ? <CheckCircleIcon size={16} color="var(--success)" />
    : type === 'error' ? <XCircleIcon size={16} color="var(--danger)" />
    : <ZapIcon size={16} color="var(--accent-light)" />
  return <div className={`toast ${type}`}>{icon}{msg}</div>
}

/** Centered loading state used by every view. */
export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="card">
      <div className="loading-overlay">
        <div className="spinner spinner-lg" />
        <span>{label}</span>
      </div>
    </div>
  )
}
