import { Component, type ReactNode } from 'react'
import { BugIcon, HomeIcon, RefreshCcwIcon } from 'lucide-react'

interface State {
  error: Error | null
}

/**
 * Catches any render error anywhere in the tree and shows a friendly,
 * on-brand fallback instead of a white screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    const { error } = this.state
    return (
      <div className="error-screen">
        <div className="error-card" role="alert">
          <div className="error-code">Oops.</div>
          <div><BugIcon size={30} color="var(--accent-light)" /></div>
          <h1>Well, this is awkward.</h1>
          <p>
            Something in the app just hit a wall — and no, it wasn't your resume.
            It's a bug on our side, and we're appropriately embarrassed.
          </p>
          <div className="error-detail">{error.message || String(error)}</div>
          <div className="error-actions">
            <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
              <RefreshCcwIcon size={14} />Try again
            </button>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              <HomeIcon size={14} />Reload app
            </button>
          </div>
          <p className="error-foot">Still stuck? Sign out and back in — it fixes 80% of digital heartbreak.</p>
        </div>
      </div>
    )
  }
}
