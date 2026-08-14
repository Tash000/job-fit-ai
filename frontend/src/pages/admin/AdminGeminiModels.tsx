import { useEffect, useState } from 'react'
import { BrainCircuitIcon, SaveIcon, PlusIcon, TrashIcon, InfoIcon } from 'lucide-react'
import { API_BASE as API } from '../../lib/api'
import type { Notify } from '../../lib/types'
import { LoadingBlock } from '../../components/ui'

const MAX_MODELS = 5

export function AdminGeminiModels({ notify }: { notify: Notify }) {
  const [models, setModels] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`${API}/api/admin/gemini-models`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => setModels(d.models))
      .catch(() => setError('Could not load the current Gemini model list.'))
  }, [])

  async function save() {
    if (!models) return
    const cleaned = models.map(m => m.trim()).filter(Boolean)
    if (cleaned.length === 0) {
      notify('Provide at least one Gemini model.', 'error')
      return
    }
    if (cleaned.length > MAX_MODELS) {
      notify(`At most ${MAX_MODELS} Gemini models can be set.`, 'error')
      return
    }
    setSaving(true)
    try {
      const r = await fetch(`${API}/api/admin/gemini-models`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: cleaned }),
      })
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}))
        throw new Error(detail.detail || `HTTP ${r.status}`)
      }
      const d = await r.json()
      setModels(d.models)
      notify('Gemini models updated — live for all users now.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save Gemini models.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <div className="card"><div className="card-body text-sm text-secondary">{error}</div></div>
  if (!models) return <LoadingBlock label="Loading Gemini models…" />

  return (
    <div className="flex flex-col gap-24 fade-in">
      <div>
        <h2>Gemini Models</h2>
        <p className="text-sm text-secondary">
          Set the top-5 Gemini models the platform API keys are used on. Every account that
          hasn't customized its own list follows these automatically — no manual entry needed.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <BrainCircuitIcon size={15} color="var(--accent-light)" />
          <span className="card-title">Top {MAX_MODELS} Gemini models</span>
        </div>
        <div className="card-body flex flex-col gap-12">
          <div className="key-list">
            {models.map((m, i) => (
              <div key={i} className="key-row model-row">
                <span className="model-default-btn is-default" title="Admin default">
                  {i + 1}
                </span>
                <input
                  className="form-input flex-1 font-mono"
                  value={m}
                  onChange={e => setModels(x => (x ? x.map((v, j) => (j === i ? e.target.value : v)) : x))}
                  placeholder="gemini-3.5-flash"
                />
                <button
                  className="btn btn-danger btn-icon btn-sm"
                  onClick={() => setModels(x => (x ? x.filter((_, j) => j !== i) : x))}
                  disabled={models.length <= 1}
                  title={models.length <= 1 ? 'At least one model is required' : 'Remove model'}
                >
                  <TrashIcon size={12} />
                </button>
              </div>
            ))}
            {models.length < MAX_MODELS && (
              <button className="btn btn-ghost btn-sm" onClick={() => setModels(x => [...(x ?? []), 'gemini-3.5-flash'])}>
                <PlusIcon size={13} />Add Model
              </button>
            )}
          </div>

          <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
              {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={13} />Save top {MAX_MODELS}</>}
            </button>
            <span className="text-xs text-muted flex items-center gap-4">
              <InfoIcon size={12} />
              Users with a custom list keep theirs until they reset.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
