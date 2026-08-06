import { useState, useEffect } from 'react'
import {
  CpuIcon, KeyIcon, ServerIcon, ShieldCheckIcon, CheckCircleIcon,
  SaveIcon, PlusIcon, TrashIcon, ExternalLinkIcon, BrainCircuitIcon, ZapIcon,
} from 'lucide-react'
import { API_BASE as API } from '../lib/api'
import type { Notify, Settings as SettingsData } from '../lib/types'
import { LoadingBlock } from '../components/ui'

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS VIEW
// ══════════════════════════════════════════════════════════════════════════════

export function SettingsView({ notify, onSaved }: { notify: Notify; onSaved: (s: SettingsData) => void }) {
  const [s, setS] = useState<SettingsData | null>(null)
  const [saving, setSaving] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')
  // Write-only key edits: newly typed keys (replacement) and removals by index.
  const [newGemini, setNewGemini] = useState<string[]>([])
  const [newNim, setNewNim] = useState<string[]>([])
  const [remGemini, setRemGemini] = useState<number[]>([])
  const [remNim, setRemNim] = useState<number[]>([])

  useEffect(() => {
    fetch(`${API}/api/settings`).then(r => r.json()).then(setS)
  }, [])

  async function save() {
    if (!s) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        gemini_models: s.gemini_models,
        nim_models: s.nim_models,
        nim_base_url: s.nim_base_url,
        ollama_enabled: s.ollama_enabled,
        ollama_base_url: s.ollama_base_url,
        ollama_model: s.ollama_model,
        active_provider: s.active_provider,
        forbidden_phrases: s.forbidden_phrases,
        tone_settings: s.tone_settings,
      }
      if (newGemini.some(k => k.trim())) body.gemini_api_keys = newGemini
      if (newNim.some(k => k.trim())) body.nim_api_keys = newNim
      if (remGemini.length) body.gemini_remove = remGemini
      if (remNim.length) body.nim_remove = remNim

      const r = await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      onSaved(d.settings ?? s)
      setNewGemini([])
      setNewNim([])
      setRemGemini([])
      setRemNim([])
      notify('Settings saved successfully', 'success')
    } catch { notify('Failed to save settings', 'error') }
    finally { setSaving(false) }
  }

  if (!s) return <LoadingBlock label="Loading settings…" />

  return (
    <div className="flex flex-col gap-24 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2>Settings</h2>
          <p className="text-sm text-secondary">Choose your AI provider and tune how cover letters are written.</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={15} />Save All</>}
        </button>
      </div>

      {/* Active Provider */}
      <div className="card card-accent">
        <div className="card-header"><CpuIcon size={15} color="var(--accent-light)" /><span className="card-title">Active LLM Provider</span></div>
        <div className="card-body flex gap-10">
          {(['gemini', 'nim', 'ollama'] as const).map(p => (
            <button key={p}
              className={`btn flex-1 ${s.active_provider === p ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setS(x => x ? { ...x, active_provider: p } : x)}>
              {p === 'gemini'
                ? <><BrainCircuitIcon size={15} />Google Gemini</>
                : p === 'nim'
                  ? <><ZapIcon size={15} />NVIDIA NIM</>
                  : <><ServerIcon size={15} />Ollama (Local)</>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Gemini */}
        <div className="card">
          <div className="card-header"><KeyIcon size={15} color="var(--accent-light)" /><span className="card-title">Google Gemini</span></div>
          <div className="card-body settings-section">
            <p className="text-xs text-muted">Add multiple API keys — rotated automatically when rate limits are hit.</p>

            <div className="settings-section-title">Stored Keys</div>
            <div className="key-list">
              {(s.keyInfo?.gemini ?? []).map(k => (
                <div key={k.index} className="key-row">
                  <span className="key-mask">{k.masked}</span>
                  <button className="btn btn-danger btn-icon btn-sm" title="Remove this stored key"
                    onClick={() => setRemGemini(r => r.includes(k.index) ? r : [...r, k.index])}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              {newGemini.map((k, i) => (
                <div key={`new-${i}`} className="key-row">
                  <input className="form-input flex-1" type="password" value={k} placeholder="AIza..." autoComplete="new-password"
                    onChange={e => setNewGemini(v => v.map((x, j) => j === i ? e.target.value : x))} />
                  <button className="btn btn-danger btn-icon btn-sm"
                    onClick={() => setNewGemini(v => v.filter((_, j) => j !== i))}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setNewGemini(v => [...v, ''])}>
                <PlusIcon size={13} />Add New Key
              </button>
            </div>
            {remGemini.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--danger)', marginTop: 6 }}>
                {remGemini.length} stored key(s) will be removed on save.
              </p>
            )}
            <p className="form-hint">Keys are encrypted and stored server-side. They are never shown again — save new keys to replace existing ones.</p>

            <div className="settings-section-title">Models to Rotate Through</div>
            <div className="key-list">
              {s.gemini_models.map((m, i) => (
                <div key={i} className="key-row">
                  <input className="form-input flex-1 font-mono" value={m}
                    onChange={e => setS(x => x ? { ...x, gemini_models: x.gemini_models.map((v, j) => j === i ? e.target.value : v) } : x)} />
                  <button className="btn btn-danger btn-icon btn-sm"
                    onClick={() => setS(x => x ? { ...x, gemini_models: x.gemini_models.filter((_, j) => j !== i) } : x)}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setS(x => x ? { ...x, gemini_models: [...x.gemini_models, 'gemini-1.5-flash'] } : x)}>
                <PlusIcon size={13} />Add Model
              </button>
            </div>
            <p className="form-hint">Models are tried in order. On rate-limit, automatically advances to next key/model pair.</p>
          </div>
        </div>

        {/* NVIDIA NIM */}
        <div className="card">
          <div className="card-header"><ServerIcon size={15} color="var(--teal)" /><span className="card-title">NVIDIA NIM</span></div>
          <div className="card-body settings-section">
            <p className="text-xs text-muted">Add NIM API keys from <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>build.nvidia.com <ExternalLinkIcon size={11} style={{ display: 'inline' }} /></a></p>

            <div className="settings-section-title">Stored Keys</div>
            <div className="key-list">
              {(s.keyInfo?.nim ?? []).map(k => (
                <div key={k.index} className="key-row">
                  <span className="key-mask">{k.masked}</span>
                  <button className="btn btn-danger btn-icon btn-sm" title="Remove this stored key"
                    onClick={() => setRemNim(r => r.includes(k.index) ? r : [...r, k.index])}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              {newNim.map((k, i) => (
                <div key={`new-${i}`} className="key-row">
                  <input className="form-input flex-1" type="password" value={k} placeholder="nvapi-..." autoComplete="new-password"
                    onChange={e => setNewNim(v => v.map((x, j) => j === i ? e.target.value : x))} />
                  <button className="btn btn-danger btn-icon btn-sm"
                    onClick={() => setNewNim(v => v.filter((_, j) => j !== i))}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setNewNim(v => [...v, ''])}>
                <PlusIcon size={13} />Add New Key
              </button>
            </div>
            {remNim.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--danger)', marginTop: 6 }}>
                {remNim.length} stored key(s) will be removed on save.
              </p>
            )}
            <p className="form-hint">Keys are encrypted and stored server-side. They are never shown again — save new keys to replace existing ones.</p>

            <div className="settings-section-title">NIM Models</div>
            <div className="key-list">
              {s.nim_models.map((m, i) => (
                <div key={i} className="key-row">
                  <input className="form-input flex-1 font-mono" value={m}
                    onChange={e => setS(x => x ? { ...x, nim_models: x.nim_models.map((v, j) => j === i ? e.target.value : v) } : x)} />
                  <button className="btn btn-danger btn-icon btn-sm"
                    onClick={() => setS(x => x ? { ...x, nim_models: x.nim_models.filter((_, j) => j !== i) } : x)}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setS(x => x ? { ...x, nim_models: [...x.nim_models, 'meta/llama-3.1-8b-instruct'] } : x)}>
                <PlusIcon size={13} />Add Model
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Base URL</label>
              <input className="form-input font-mono" value={s.nim_base_url}
                onChange={e => setS(x => x ? { ...x, nim_base_url: e.target.value } : x)} />
              <span className="form-hint">Default: https://integrate.api.nvidia.com/v1</span>
            </div>
          </div>
        </div>

        {/* Ollama */}
        <div className="card">
          <div className="card-header"><ServerIcon size={15} color="var(--text-muted)" /><span className="card-title">Ollama (Local LLM)</span></div>
          <div className="card-body settings-section">
            <div className="flex items-center justify-between" style={{ padding: '8px 0' }}>
              <span className="form-label">Enable Ollama</span>
              <button
                className={`btn btn-sm ${s.ollama_enabled ? 'btn-success' : 'btn-ghost'}`}
                onClick={() => setS(x => x ? { ...x, ollama_enabled: !x.ollama_enabled } : x)}>
                {s.ollama_enabled ? <><CheckCircleIcon size={13} />Enabled</> : 'Disabled'}
              </button>
            </div>
            <div className="form-group">
              <label className="form-label">Ollama Base URL</label>
              <input className="form-input font-mono" value={s.ollama_base_url}
                onChange={e => setS(x => x ? { ...x, ollama_base_url: e.target.value } : x)} />
            </div>
            <div className="form-group">
              <label className="form-label">Model Name</label>
              <input className="form-input font-mono" placeholder="llama3, mistral, phi3…" value={s.ollama_model}
                onChange={e => setS(x => x ? { ...x, ollama_model: e.target.value } : x)} />
              <span className="form-hint">Run: <code style={{ color: 'var(--accent-light)', fontSize: '0.8rem' }}>ollama pull llama3</code></span>
            </div>
          </div>
        </div>

        {/* Cover Letter Memory */}
        <div className="card">
          <div className="card-header"><ShieldCheckIcon size={15} color="var(--warning)" /><span className="card-title">Cover Letter Memory</span></div>
          <div className="card-body settings-section">
            <div className="settings-section-title">Forbidden Phrases</div>
            <p className="text-xs text-muted">These clichéd phrases will be stripped from every generated letter.</p>
            <div className="flex flex-wrap gap-6">
              {s.forbidden_phrases.map((ph, i) => (
                <div key={i} className="keyword-tag missing" style={{ cursor: 'pointer' }}
                  onClick={() => setS(x => x ? { ...x, forbidden_phrases: x.forbidden_phrases.filter((_, j) => j !== i) } : x)}>
                  {ph} ×
                </div>
              ))}
            </div>
            <div className="flex gap-8">
              <input className="form-input flex-1" placeholder="e.g. I am passionate about" value={newPhrase}
                onChange={e => setNewPhrase(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newPhrase.trim()) { setS(x => x ? { ...x, forbidden_phrases: [...x.forbidden_phrases, newPhrase.trim()] } : x); setNewPhrase('') } }} />
              <button className="btn btn-warning btn-sm" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}
                onClick={() => { if (newPhrase.trim()) { setS(x => x ? { ...x, forbidden_phrases: [...x.forbidden_phrases, newPhrase.trim()] } : x); setNewPhrase('') } }}>
                <PlusIcon size={13} />Add
              </button>
            </div>

            <div className="settings-section-title">Writing Style</div>
            <div className="form-group">
              <label className="form-label">Default Tone</label>
              <select className="form-select" value={s.tone_settings.writingStyle ?? 'professional'}
                onChange={e => setS(x => x ? { ...x, tone_settings: { ...x.tone_settings, writingStyle: e.target.value } } : x)}>
                {['professional', 'academic', 'concise', 'conversational'].map(o => (
                  <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-10">
              <input type="checkbox" id="active-voice" checked={s.tone_settings.activeVoice ?? true}
                onChange={e => setS(x => x ? { ...x, tone_settings: { ...x.tone_settings, activeVoice: e.target.checked } } : x)} />
              <label htmlFor="active-voice" className="form-label" style={{ cursor: 'pointer', marginBottom: 0 }}>Prefer active voice</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
