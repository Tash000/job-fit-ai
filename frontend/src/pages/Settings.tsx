import { useState, useEffect } from 'react'
import {
  CpuIcon, ServerIcon, ShieldCheckIcon, CheckCircleIcon,
  SaveIcon, PlusIcon, TrashIcon, ExternalLinkIcon, BrainCircuitIcon, ZapIcon,
  PaletteIcon, SunIcon, MoonIcon, MonitorIcon, AlertTriangleIcon, LockIcon,
  StarIcon, type LucideIcon,
} from 'lucide-react'
import { API_BASE as API } from '../lib/api'
import type { Notify, Settings as SettingsData } from '../lib/types'
import { LoadingBlock } from '../components/ui'
import { InstallButton } from '../components/InstallButton'
import { useAppearance, type Accent, type Theme } from '../lib/theme'

const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
]

const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: 'blue', label: 'Blue', swatch: 'swatch-blue' },
  { value: 'purple', label: 'Purple', swatch: 'swatch-purple' },
]

type Provider = 'gemini' | 'nim' | 'ollama'

const PROVIDER_META: Record<Provider, { label: string; icon: LucideIcon }> = {
  gemini: { label: 'Google Gemini', icon: BrainCircuitIcon },
  nim: { label: 'NVIDIA NIM', icon: ZapIcon },
  ollama: { label: 'Ollama (Local)', icon: ServerIcon },
}

const CLEAR_SCOPES: Record<'keys' | 'data' | 'all', { title: string; desc: string; danger: string }> = {
  keys: {
    title: 'Reset API keys & setup',
    desc: 'Clears provider API keys, models, and preferences. Resumes, applications, and analyses are kept.',
    danger: 'provider keys and configuration',
  },
  data: {
    title: 'Clear all data',
    desc: 'Deletes every application, analysis, saved resume, and your profile. API keys and setup are kept.',
    danger: 'all applications, analyses, resumes, and your profile',
  },
  all: {
    title: 'Start fresh — erase everything',
    desc: 'Wipes all applications, analyses, resumes, profile, API keys, and settings. Your account starts as new.',
    danger: 'everything on this account (sign-in stays)',
  },
}

// ══════════════════════════════════════════════════════════════════════════════
// CLEAR-DATA CONFIRMATION MODAL (password verified)
// ══════════════════════════════════════════════════════════════════════════════

function ClearDataModal({
  scope, onClose, notify,
}: {
  scope: 'keys' | 'data' | 'all'
  onClose: () => void
  notify: Notify
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`${API}/api/account/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, password }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(typeof d?.detail === 'string' ? d.detail : 'Verification failed. Try again.')
        setBusy(false)
        return
      }
      onClose()
      notify('Account data cleared', 'success')
      // Reload so every view refetches the empty / reset state.
      setTimeout(() => window.location.reload(), 800)
    } catch {
      setError('Request failed. Check your connection and try again.')
      setBusy(false)
    }
  }

  const meta = CLEAR_SCOPES[scope]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card fade-in modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
        <div className="card-header" style={{ padding: '18px 20px 0' }}>
          <AlertTriangleIcon size={17} color="var(--danger)" />
          <span className="card-title" style={{ color: 'var(--danger)' }}>{meta.title}</span>
        </div>
        <div className="card-body flex flex-col gap-12">
          <p className="text-sm text-secondary">
            This will permanently delete <strong>{meta.danger}</strong>. This cannot be undone.
            Enter your account password to confirm.
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="clear-password">Password</label>
            <input
              id="clear-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !busy) void confirm() }}
            />
          </div>
          {error && <div className="text-sm" style={{ color: 'var(--danger)' }}>{error}</div>}
          <div className="flex gap-8">
            <button className="btn btn-danger flex-1" onClick={confirm} disabled={busy}>
              {busy ? <><div className="spinner" />Verifying…</> : <><LockIcon size={14} />Confirm & {scope === 'keys' ? 'reset' : scope === 'data' ? 'clear' : 'erase'}</>}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS VIEW
// ══════════════════════════════════════════════════════════════════════════════

export function SettingsView({ notify, onSaved }: { notify: Notify; onSaved: (s: SettingsData) => void }) {
  const { theme, accent, setTheme, setAccent } = useAppearance()
  const [s, setS] = useState<SettingsData | null>(null)
  const [saving, setSaving] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')
  const [providerTab, setProviderTab] = useState<Provider>('gemini')
  const [clearScope, setClearScope] = useState<'keys' | 'data' | 'all' | null>(null)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  // Write-only key edits: newly typed keys (replacement) and removals by index.
  const [newGemini, setNewGemini] = useState<string[]>([])
  const [newNim, setNewNim] = useState<string[]>([])
  const [remGemini, setRemGemini] = useState<number[]>([])
  const [remNim, setRemNim] = useState<number[]>([])

  useEffect(() => {
    fetch(`${API}/api/settings`).then(r => r.json()).then(setS)
  }, [])

  /** PATCH only the supplied fields; server returns the full fresh settings. */
  async function savePartial(body: Record<string, unknown>, okMsg: string): Promise<boolean> {
    if (!s) return false
    setSaving(true)
    try {
      const r = await fetch(`${API}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { notify(typeof d?.detail === 'string' ? d.detail : 'Failed to save settings', 'error'); return false }
      const fresh = d.settings ?? s
      onSaved(fresh)
      setS(fresh)
      notify(okMsg, 'success')
      return true
    } catch { notify('Failed to save settings', 'error'); return false }
    finally { setSaving(false) }
  }

  /** Save only the fields belonging to the currently open provider tab. */
  async function saveProviderTab() {
    if (!s) return
    const body: Record<string, unknown> = {}
    if (providerTab === 'gemini') {
      body.gemini_models = s.gemini_models
      if (newGemini.some(k => k.trim())) body.gemini_api_keys = newGemini
      if (remGemini.length) body.gemini_remove = remGemini
    } else if (providerTab === 'nim') {
      body.nim_models = s.nim_models
      body.nim_base_url = s.nim_base_url
      if (newNim.some(k => k.trim())) body.nim_api_keys = newNim
      if (remNim.length) body.nim_remove = remNim
    } else {
      body.ollama_enabled = s.ollama_enabled
      body.ollama_base_url = s.ollama_base_url
      body.ollama_model = s.ollama_model
    }
    const okSaved = await savePartial(body, `${PROVIDER_META[providerTab].label} settings saved`)
    if (okSaved) {
      setNewGemini([])
      setNewNim([])
      setRemGemini([])
      setRemNim([])
    }
  }

  /** Switching the active provider is a one-field change → save immediately. */
  async function activateProvider(p: Provider) {
    await savePartial({ active_provider: p }, `${PROVIDER_META[p].label} is now the active provider`)
  }

  /** Move a model to the front of its list — the first model is the default. */
  function setDefaultModel(list: string[], idx: number): string[] {
    if (idx === 0) return list
    const copy = [...list]
    const [m] = copy.splice(idx, 1)
    return [m, ...copy]
  }

  const addAdminEmail = () => {
    const e = newAdminEmail.trim().toLowerCase()
    if (!e) return
    setS(x => x && !x.admin_emails.includes(e) ? { ...x, admin_emails: [...x.admin_emails, e] } : x)
    setNewAdminEmail('')
  }

  if (!s) return <LoadingBlock label="Loading settings…" />

  const isGeminiActive = s.active_provider === 'gemini'
  const isNimActive = s.active_provider === 'nim'
  const isOllamaActive = s.active_provider === 'ollama'

  return (
    <div className="flex flex-col gap-24 fade-in">
      <div>
        <h2>Settings</h2>
        <p className="text-sm text-secondary">Choose your AI provider and tune how cover letters are written. Each section saves on its own.</p>
      </div>

      {/* Appearance — theme + accent + install */}
      <div className="card">
        <div className="card-header"><PaletteIcon size={15} color="var(--accent-light)" /><span className="card-title">Appearance</span></div>
        <div className="card-body settings-section">
          <div className="settings-section-title">Theme</div>
          <div className="flex gap-8 flex-wrap">
            {THEME_OPTIONS.map(opt => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.value}
                  className={`btn flex-1 ${theme === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setTheme(opt.value)}
                >
                  <Icon size={14} />{opt.label}
                </button>
              )
            })}
          </div>

          <div className="settings-section-title">Accent Color</div>
          <p className="text-xs text-muted">The brand color used for buttons, highlights, and charts.</p>
          <div className="flex gap-8 flex-wrap">
            {ACCENTS.map(a => (
              <button
                key={a.value}
                className={`accent-swatch ${accent === a.value ? 'active' : ''}`}
                onClick={() => setAccent(a.value)}
              >
                <span className={`swatch ${a.swatch}`} />{a.label}
              </button>
            ))}
          </div>

          <div className="settings-section-title">Install App</div>
          <p className="text-xs text-muted">Add Vitralume to your home screen for one-tap launch and offline access.</p>
          <div><InstallButton /></div>
        </div>
      </div>

      {/* ── AI Providers: tabbed, with default-model selection ── */}
      <div className="card card-accent">
        <div className="card-header"><CpuIcon size={15} color="var(--accent-light)" /><span className="card-title">AI Providers</span></div>
        <div className="card-body" style={{ paddingTop: 14 }}>
          {/* Provider tabs — the active provider carries a live dot */}
          <div className="tabs" style={{ marginBottom: 18 }}>
            {(Object.keys(PROVIDER_META) as Provider[]).map(p => {
              const Icon = PROVIDER_META[p].icon
              const isActive = p === 'gemini' ? isGeminiActive : p === 'nim' ? isNimActive : isOllamaActive
              return (
                <button
                  key={p}
                  className={`tab-btn ${providerTab === p ? 'active' : ''}`}
                  onClick={() => setProviderTab(p)}
                >
                  <Icon size={14} />{PROVIDER_META[p].label}
                  {isActive && <span className="provider-live-dot" title="Active provider" />}
                </button>
              )
            })}
          </div>

          {providerTab === 'gemini' && (
            <div className="settings-section fade-in">
              <p className="text-xs text-muted">Add multiple API keys — rotated automatically when rate limits are hit.</p>

              <div className="settings-section-title">API Keys</div>
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

              <div className="settings-section-title">Models</div>
              <div className="key-list">
                {s.gemini_models.map((m, i) => (
                  <div key={i} className="key-row model-row">
                    <button
                      className={`model-default-btn ${i === 0 ? 'is-default' : ''}`}
                      title={i === 0 ? 'Default model' : 'Set as default model'}
                      onClick={() => setS(x => x ? { ...x, gemini_models: setDefaultModel(x.gemini_models, i) } : x)}
                    >
                      {i === 0 ? <CheckCircleIcon size={14} /> : <StarIcon size={14} />}
                    </button>
                    <input className="form-input flex-1 font-mono" value={m}
                      onChange={e => setS(x => x ? { ...x, gemini_models: x.gemini_models.map((v, j) => j === i ? e.target.value : v) } : x)} />
                    {i === 0 && <span className="active-model-pill">Active now</span>}
                    <button className="btn btn-danger btn-icon btn-sm"
                      onClick={() => setS(x => x ? { ...x, gemini_models: x.gemini_models.filter((_, j) => j !== i) } : x)}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={() => setS(x => x ? { ...x, gemini_models: [...x.gemini_models, 'gemini-3.5-flash'] } : x)}>
                  <PlusIcon size={13} />Add Model
                </button>
              </div>
              <p className="form-hint">The default model is tried first; on rate limits it automatically advances to the next key/model pair.</p>

              <ProviderActiveToggle
                label="Google Gemini"
                active={isGeminiActive}
                busy={saving}
                onActivate={() => void activateProvider('gemini')}
              />
            </div>
          )}

          {providerTab === 'nim' && (
            <div className="settings-section fade-in">
              <p className="text-xs text-muted">Add NIM API keys from <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>build.nvidia.com <ExternalLinkIcon size={11} style={{ display: 'inline' }} /></a></p>

              <div className="settings-section-title">API Keys</div>
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
                  <div key={i} className="key-row model-row">
                    <button
                      className={`model-default-btn ${i === 0 ? 'is-default' : ''}`}
                      title={i === 0 ? 'Default model' : 'Set as default model'}
                      onClick={() => setS(x => x ? { ...x, nim_models: setDefaultModel(x.nim_models, i) } : x)}
                    >
                      {i === 0 ? <CheckCircleIcon size={14} /> : <StarIcon size={14} />}
                    </button>
                    <input className="form-input flex-1 font-mono" value={m}
                      onChange={e => setS(x => x ? { ...x, nim_models: x.nim_models.map((v, j) => j === i ? e.target.value : v) } : x)} />
                    {i === 0 && <span className="active-model-pill">Active now</span>}
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

              <ProviderActiveToggle
                label="NVIDIA NIM"
                active={isNimActive}
                busy={saving}
                onActivate={() => void activateProvider('nim')}
              />
            </div>
          )}

          {providerTab === 'ollama' && (
            <div className="settings-section fade-in">
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

              <ProviderActiveToggle
                label="Ollama (Local)"
                active={isOllamaActive}
                busy={saving}
                onActivate={() => void activateProvider('ollama')}
              />
            </div>
          )}

          {/* Per-tab save — each provider tab saves only its own fields. */}
          <div className="provider-save-row">
            <span className="text-xs text-muted">This saves only the {PROVIDER_META[providerTab].label} tab.</span>
            <button className="btn btn-primary btn-sm" onClick={saveProviderTab} disabled={saving}>
              {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={13} />Save {PROVIDER_META[providerTab].label} settings</>}
            </button>
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

          <div className="flex justify-end">
            <button className="btn btn-primary btn-sm"
              onClick={() => void savePartial({ forbidden_phrases: s.forbidden_phrases, tone_settings: s.tone_settings }, 'Cover letter memory saved')}
              disabled={saving}>
              {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={13} />Save memory</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Admin Emails (limit exemptions) ── */}
      <div className="card">
        <div className="card-header"><StarIcon size={15} color="var(--accent-light)" /><span className="card-title">Admin Emails</span></div>
        <div className="card-body settings-section">
          <p className="text-xs text-muted">
            Emails on this list are treated as admins: they skip the per-minute rate limit and the
            per-account storage caps (<strong>500 job analyses</strong> and <strong>5 saved resumes</strong>).
            Add your own email so you never hit those limits on your own account.
          </p>
          <div className="flex flex-wrap gap-6">
            {(s.admin_emails ?? []).map((em, i) => (
              <div key={i} className="keyword-tag neutral" style={{ cursor: 'pointer' }}
                onClick={() => setS(x => x ? { ...x, admin_emails: x.admin_emails.filter((_, j) => j !== i) } : x)}
                title="Click to remove">
                {em} ×
              </div>
            ))}
          </div>
          <div className="flex gap-8">
            <input
              className="form-input flex-1"
              type="email"
              placeholder="you@example.com"
              value={newAdminEmail}
              onChange={e => setNewAdminEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addAdminEmail() }}
            />
            <button className="btn btn-secondary btn-sm" onClick={addAdminEmail}>
              <PlusIcon size={13} />Add
            </button>
          </div>
          <div className="flex justify-end">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void savePartial({ admin_emails: s.admin_emails ?? [] }, 'Admin emails saved')}
              disabled={saving}
            >
              {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={13} />Save admin emails</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div className="card danger-zone">
        <div className="card-header"><AlertTriangleIcon size={15} color="var(--danger)" /><span className="card-title" style={{ color: 'var(--danger)' }}>Danger Zone</span></div>
        <div className="card-body flex flex-col gap-12">
          {(Object.keys(CLEAR_SCOPES) as ('keys' | 'data' | 'all')[]).map(sc => (
            <div key={sc} className="danger-row">
              <div className="flex-1">
                <div className="form-label" style={{ color: 'var(--danger)' }}>{CLEAR_SCOPES[sc].title}</div>
                <p className="text-xs text-muted" style={{ marginTop: 3 }}>{CLEAR_SCOPES[sc].desc}</p>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => setClearScope(sc)}>
                {sc === 'all' ? <TrashIcon size={13} /> : <LockIcon size={13} />}
                {sc === 'keys' ? 'Reset setup' : sc === 'data' ? 'Clear data' : 'Erase all'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {clearScope && (
        <ClearDataModal scope={clearScope} onClose={() => setClearScope(null)} notify={notify} />
      )}
    </div>
  )
}

/** Bottom-of-tab control that makes the shown provider the active one. */
function ProviderActiveToggle({ label, active, busy, onActivate }: { label: string; active: boolean; busy: boolean; onActivate: () => void }) {
  return (
    <div className="provider-active-row">
      <div>
        <div className="form-label">Active provider</div>
        <div className="text-xs text-muted">All AI features try this provider first — saved instantly.</div>
      </div>
      {active ? (
        <span className="provider-badge"><span className="dot" />{label.toUpperCase()} ACTIVE</span>
      ) : (
        <button className="btn btn-secondary btn-sm" onClick={onActivate} disabled={busy}>
          {busy ? <><div className="spinner" />Saving…</> : <><CheckCircleIcon size={13} />Make {label} active</>}
        </button>
      )}
    </div>
  )
}
