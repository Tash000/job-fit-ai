import { useState, useEffect, useCallback } from 'react'
import {
  UserIcon, SparklesIcon, CpuIcon, BookOpenIcon, ZapIcon,
  SaveIcon, PlusIcon, TrashIcon, ClipboardPasteIcon, FilesIcon, PencilIcon,
  GraduationCapIcon, AwardIcon, LanguagesIcon, HeartIcon, FileTextIcon,
  ListIcon,
} from 'lucide-react'
import { API_BASE as API } from '../lib/api'
import type {
  Notify, Profile as ProfileData, ResumeLibrary, ParsedProfile,
} from '../lib/types'
import { LoadingBlock } from '../components/ui'

// ══════════════════════════════════════════════════════════════════════════════
// Reusable section editors (operate on parsed_profile slices)
// ══════════════════════════════════════════════════════════════════════════════

/** Editable tag list (skills, hobbies, links…). */
function StringListEditor({ items, onChange, placeholder }: {
  items: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const [val, setVal] = useState('')
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-6">
        {items.map((s, i) => (
          <div key={i} className="keyword-tag neutral" style={{ cursor: 'pointer', gap: 6 }}>
            {s}
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, lineHeight: 1 }}
              onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
      <div className="flex gap-6">
        <input className="form-input flex-1" placeholder={placeholder} value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onChange([...items, val.trim()]); setVal('') } }} />
        <button className="btn btn-secondary btn-sm" onClick={() => { if (val.trim()) { onChange([...items, val.trim()]); setVal('') } }}>
          <PlusIcon size={14} />Add
        </button>
      </div>
    </div>
  )
}

/** language + proficiency rows. */
function LanguageEditor({ items, onChange }: {
  items: ParsedProfile['languages']
  onChange: (next: ParsedProfile['languages']) => void
}) {
  return (
    <div className="flex flex-col gap-8">
      {items.map((l, i) => (
        <div key={i} className="grid-2" style={{ gap: 8 }}>
          <input className="form-input" placeholder="Language (e.g. German)" value={l.language}
            onChange={e => onChange(items.map((x, j) => j === i ? { ...x, language: e.target.value } : x))} />
          <div className="flex gap-8">
            <input className="form-input flex-1" placeholder="Proficiency (e.g. B2, Fluent)" value={l.proficiency}
              onChange={e => onChange(items.map((x, j) => j === i ? { ...x, proficiency: e.target.value } : x))} />
            <button className="btn btn-danger btn-icon btn-sm" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <TrashIcon size={12} />
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => onChange([...items, { language: '', proficiency: '' }])}>
        <PlusIcon size={13} />Add Language
      </button>
    </div>
  )
}

/** name + issuer + year rows. */
function CertificationEditor({ items, onChange }: {
  items: ParsedProfile['certifications']
  onChange: (next: ParsedProfile['certifications']) => void
}) {
  return (
    <div className="flex flex-col gap-10">
      {items.map((c, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div className="grid-2" style={{ gap: 8, marginBottom: 6 }}>
            <input className="form-input" placeholder="Certification (e.g. AWS Solutions Architect)" value={c.name}
              onChange={e => onChange(items.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} style={{ fontWeight: 600 }} />
            <input className="form-input" placeholder="Issuer (e.g. Amazon)" value={c.issuer}
              onChange={e => onChange(items.map((x, j) => j === i ? { ...x, issuer: e.target.value } : x))} />
          </div>
          <div className="flex gap-8">
            <input className="form-input" style={{ maxWidth: 140 }} placeholder="Year" value={c.year}
              onChange={e => onChange(items.map((x, j) => j === i ? { ...x, year: e.target.value } : x))} />
            <button className="btn btn-danger btn-icon btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <TrashIcon size={12} />
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => onChange([...items, { name: '', issuer: '', year: '' }])}>
        <PlusIcon size={13} />Add Certification
      </button>
    </div>
  )
}

/** title + year + description rows. */
function AchievementEditor({ items, onChange }: {
  items: ParsedProfile['achievements']
  onChange: (next: ParsedProfile['achievements']) => void
}) {
  return (
    <div className="flex flex-col gap-10">
      {items.map((a, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div className="flex gap-8" style={{ marginBottom: 6 }}>
            <input className="form-input flex-1" placeholder="Achievement (e.g. Best Paper Award)" value={a.title}
              onChange={e => onChange(items.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} style={{ fontWeight: 600 }} />
            <input className="form-input" style={{ maxWidth: 140 }} placeholder="Year" value={a.year}
              onChange={e => onChange(items.map((x, j) => j === i ? { ...x, year: e.target.value } : x))} />
            <button className="btn btn-danger btn-icon btn-sm" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <TrashIcon size={12} />
            </button>
          </div>
          <textarea className="form-textarea" placeholder="Details…" value={a.description}
            onChange={e => onChange(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
            style={{ minHeight: 56 }} />
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => onChange([...items, { title: '', year: '', description: '' }])}>
        <PlusIcon size={13} />Add Achievement
      </button>
    </div>
  )
}

/** Catch-all for any resume section not in the standard schema. */
function AdditionalSectionsEditor({ items, onChange }: {
  items: ParsedProfile['additional_sections']
  onChange: (next: ParsedProfile['additional_sections']) => void
}) {
  return (
    <div className="flex flex-col gap-10">
      {items.map((sec, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div className="flex gap-8" style={{ marginBottom: 6 }}>
            <input className="form-input flex-1" placeholder="Section heading (e.g. Volunteering)" value={sec.title}
              onChange={e => onChange(items.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} style={{ fontWeight: 600 }} />
            <button className="btn btn-danger btn-icon btn-sm" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <TrashIcon size={12} />
            </button>
          </div>
          <textarea className="form-textarea" placeholder="Full section content…" value={sec.content}
            onChange={e => onChange(items.map((x, j) => j === i ? { ...x, content: e.target.value } : x))}
            style={{ minHeight: 72 }} />
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => onChange([...items, { title: '', content: '' }])}>
        <PlusIcon size={13} />Add Section
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE VIEW
// ══════════════════════════════════════════════════════════════════════════════

export function ProfileView({ notify }: { notify: Notify }) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [library, setLibrary] = useState<ResumeLibrary | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [showPasteText, setShowPasteText] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [parsingText, setParsingText] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  /** Immutable update of one parsed_profile slice. */
  const patchProfile = (patch: Partial<ParsedProfile>) =>
    setProfile(p => p ? { ...p, parsed_profile: { ...p.parsed_profile, ...patch } } : p)

  const loadLibrary = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/resumes`)
      const d = await r.json()
      setLibrary(d)
    } catch { setLibrary(null) }
  }, [])

  useEffect(() => {
    fetch(`${API}/api/profile`)
      .then(r => r.json())
      .then(d => setProfile(d && d.resume_text !== undefined ? d : null))
      .catch(() => setProfile(null))
    void loadLibrary()
  }, [loadLibrary])

  async function save() {
    if (!profile) return
    setSaving(true)
    try {
      const r = await fetch(`${API}/api/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!r.ok) { notify('Save failed', 'error'); return }
      notify('Profile saved', 'success')
      void loadLibrary()
    } catch { notify('Save failed', 'error') }
    finally { setSaving(false) }
  }

  /** Save parsed content into the resume library (auto-named), then activate it. */
  async function saveToLibrary(name: string, resumeText: string, parsed: ParsedProfile) {
    const r = await fetch(`${API}/api/resumes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, resume_text: resumeText, parsed_profile: parsed }),
    })
    const d = await r.json().catch(() => ({}))
    if (r.status === 409) {
      notify('Resume library is full (5 max) — rename or delete an existing one first', 'error')
      return false
    }
    if (!r.ok) {
      notify(typeof d?.detail === 'string' ? d.detail : 'Could not save resume to library', 'error')
      return false
    }
    await fetch(`${API}/api/resumes/${d.resume.id}/activate`, { method: 'POST' })
    await loadLibrary()
    return true
  }

  async function uploadPDF(file: File) {
    if (!file.name.endsWith('.pdf')) { notify('Only PDF files are supported', 'error'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`${API}/api/resumes/upload`, { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.status === 409) {
        notify('Resume library is full (5 max) — rename or delete an existing one first', 'error')
        return
      }
      if (!r.ok) { notify(typeof d?.detail === 'string' ? d.detail : 'Upload failed', 'error'); return }
      setProfile({ resume_text: d.resume_text, display_name: profile?.display_name ?? '', parsed_profile: d.parsed_profile })
      await loadLibrary()
      notify('AI parsed your resume — saved to your library', 'success')
    } catch { notify('Upload failed', 'error') }
    finally { setUploading(false) }
  }

  async function parseResumeText() {
    if (!pasteText.trim()) { notify('Paste your resume text first', 'error'); return }
    setParsingText(true)
    try {
      const r = await fetch(`${API}/api/profile/parse-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: pasteText }),
      })
      const d = await r.json()
      setProfile(p => p ? { ...p, parsed_profile: d.parsed_profile, resume_text: pasteText } : null)
      await saveToLibrary(`Pasted resume ${new Date().toISOString().slice(0, 10)}`, pasteText, d.parsed_profile)
      setShowPasteText(false)
      setPasteText('')
      notify('AI parsed your resume — check the fields below', 'success')
    } catch { notify('Parsing failed', 'error') }
    finally { setParsingText(false) }
  }

  async function saveRename(id: number) {
    const name = editName.trim()
    setEditingId(null)
    if (!name) return
    const r = await fetch(`${API}/api/resumes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) notify(typeof d?.detail === 'string' ? d.detail : 'Invalid name', 'error')
    await loadLibrary()
  }

  async function activateResume(id: number) {
    await fetch(`${API}/api/resumes/${id}/activate`, { method: 'POST' })
    await loadLibrary()
    const r = await fetch(`${API}/api/profile`)
    const d = await r.json()
    setProfile(d && d.resume_text !== undefined ? d : null)
    notify('Resume set as active — it now powers your analyses', 'success')
  }

  async function deleteResume(id: number) {
    await fetch(`${API}/api/resumes/${id}`, { method: 'DELETE' })
    await loadLibrary()
    notify('Resume deleted from library', 'success')
  }

  if (!profile) return <LoadingBlock label="Loading profile…" />

  const pp = profile.parsed_profile
  const resumeMax = library?.max ?? 5

  return (
    <div className="flex flex-col gap-20 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2>My Profile</h2>
          <p className="text-sm text-secondary">Every section of your resume is parsed and editable — skills, education, experience, and more.</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={15} />Save Profile</>}
        </button>
      </div>

      {/* ── Resume Library (up to 5) ── */}
      <div className="card">
        <div className="card-header">
          <FilesIcon size={15} color="var(--accent-light)" />
          <span className="card-title">Resume Library ({library?.resumes.length ?? 0}/{resumeMax})</span>
          <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>Stored per account · click a name to rename</span>
        </div>
        <div className="card-body flex flex-col gap-8">
          {library && library.resumes.length === 0 ? (
            <p className="text-xs text-muted" style={{ padding: '8px 0' }}>
              No saved resumes yet. Upload a PDF or paste resume text below and it will be stored here (up to {resumeMax}).
            </p>
          ) : (
            library?.resumes.map(r => (
              <div key={r.id} className="resume-row">
                {editingId === r.id ? (
                  <input
                    className="form-input flex-1"
                    value={editName}
                    maxLength={30}
                    autoFocus
                    placeholder="Resume name (max 30 chars)"
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') void saveRename(r.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                ) : (
                  <div className="resume-row-name flex-1" onClick={() => { setEditingId(r.id); setEditName(r.name) }} title="Click to rename">
                    <span className="app-company">{r.name}</span>
                    {r.profile_name && <span className="text-xs text-muted"> · {r.profile_name}</span>}
                  </div>
                )}
                {r.is_active && <span className="active-model-pill">Active</span>}
                <div className="flex gap-6">
                  {!r.is_active && (
                    <button className="btn btn-secondary btn-sm" onClick={() => void activateResume(r.id)}>Use</button>
                  )}
                  <button className="btn btn-ghost btn-icon btn-sm" title="Rename" onClick={() => { setEditingId(r.id); setEditName(r.name) }}>
                    <PencilIcon size={12} />
                  </button>
                  <button className="btn btn-danger btn-icon btn-sm" title="Delete" onClick={() => void deleteResume(r.id)}>
                    <TrashIcon size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
          <p className="form-hint">Names are limited to 30 characters and only letters, numbers, spaces, dots, dashes and underscores — special characters are rejected.</p>
        </div>
      </div>

      <div className="split-layout-wide">
        {/* ── Left column ── */}
        <div className="flex flex-col gap-16">
          {/* PDF Upload */}
          <div
            className={`upload-zone ${drag ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void uploadPDF(f) }}
            onClick={() => document.getElementById('pdf-upload')?.click()}
          >
            <input id="pdf-upload" type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void uploadPDF(f) }} />
            {uploading
              ? <><div className="spinner spinner-lg" style={{ margin: '0 auto 8px' }} /><p className="text-sm text-muted">AI is parsing your resume…</p></>
              : <><SparklesIcon size={24} color="var(--accent-light)" style={{ margin: '0 auto 8px' }} /><p className="text-sm text-muted">Drop PDF here or click to upload</p><p className="text-xs text-muted" style={{ marginTop: 4 }}>AI extracts every section — skills, education, experience & more</p></>}
          </div>

          {/* Paste text alternative */}
          <div style={{ textAlign: 'center', marginTop: -4 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowPasteText(v => !v)}
              style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
            >
              <ClipboardPasteIcon size={13} />
              {showPasteText ? 'Hide' : 'No PDF? Paste resume text instead'}
            </button>
          </div>

          {showPasteText && (
            <div className="card card-accent fade-in">
              <div className="card-header"><SparklesIcon size={15} color="var(--accent-light)" /><span className="card-title">AI Parse from Text</span></div>
              <div className="card-body flex flex-col gap-10">
                <p className="text-sm text-secondary">Paste your resume text below. AI will extract all fields automatically.</p>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 200 }}
                  placeholder="Paste your full resume text here…"
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                />
                <button className="btn btn-primary" onClick={parseResumeText} disabled={parsingText}>
                  {parsingText ? <><div className="spinner" />AI is parsing…</> : <><SparklesIcon size={14} />Extract Profile with AI</>}
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header"><UserIcon size={15} color="var(--accent-light)" /><span className="card-title">Personal Info</span></div>
            <div className="card-body flex flex-col gap-10">
              <div className="form-group">
                <label className="form-label">Display Name (for the greeting on your home page)</label>
                <input className="form-input" maxLength={80} placeholder="e.g. Tousif"
                  value={profile.display_name ?? ''}
                  onChange={e => setProfile(p => p ? { ...p, display_name: e.target.value } : p)} />
                <span className="form-hint">Used for a friendly "Hi {profile.display_name || 'there'} …" greeting on the dashboard.</span>
              </div>
              {[
                ['name', 'Full Name', 'Dr. Thousi Yousi'],
                ['email', 'Email', 'yousi@example.com'],
                ['phone', 'Phone', '+49 123 456789'],
                ['address', 'Address', 'Munich, Germany'],
              ].map(([k, label, ph]) => (
                <div key={k} className="form-group">
                  <label className="form-label">{label}</label>
                  <input className="form-input" placeholder={ph}
                    value={(pp as unknown as Record<string, string>)[k] ?? ''}
                    onChange={e => patchProfile({ [k]: e.target.value })} />
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Summary / Objective</label>
                <textarea className="form-textarea" placeholder="e.g. Robotics researcher specializing in…"
                  value={pp.career_goals ?? ''}
                  onChange={e => patchProfile({ career_goals: e.target.value })} style={{ minHeight: 80 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Links (LinkedIn, GitHub, portfolio…)</label>
                <StringListEditor items={pp.links ?? []} placeholder="https://…"
                  onChange={links => patchProfile({ links })} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><CpuIcon size={15} color="var(--teal)" /><span className="card-title">Skills</span></div>
            <div className="card-body">
              <StringListEditor items={pp.skills ?? []} placeholder="Add skill (e.g. ROS2)"
                onChange={skills => patchProfile({ skills })} />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><LanguagesIcon size={15} color="var(--accent-light)" /><span className="card-title">Languages</span></div>
            <div className="card-body">
              <LanguageEditor items={pp.languages ?? []} onChange={languages => patchProfile({ languages })} />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><HeartIcon size={15} color="var(--danger)" /><span className="card-title">Hobbies & Interests</span></div>
            <div className="card-body">
              <StringListEditor items={pp.hobbies ?? []} placeholder="Add hobby (e.g. Photography)"
                onChange={hobbies => patchProfile({ hobbies })} />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><AwardIcon size={15} color="var(--warning)" /><span className="card-title">Certifications ({(pp.certifications ?? []).length})</span></div>
            <div className="card-body">
              <CertificationEditor items={pp.certifications ?? []} onChange={certifications => patchProfile({ certifications })} />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><AwardIcon size={15} color="var(--teal)" /><span className="card-title">Achievements & Awards ({(pp.achievements ?? []).length})</span></div>
            <div className="card-body">
              <AchievementEditor items={pp.achievements ?? []} onChange={achievements => patchProfile({ achievements })} />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><FileTextIcon size={15} color="var(--text-muted)" /><span className="card-title">Declaration</span></div>
            <div className="card-body">
              <textarea className="form-textarea" placeholder="e.g. I hereby declare that the above information is true to the best of my knowledge."
                value={pp.declaration ?? ''}
                onChange={e => patchProfile({ declaration: e.target.value })} style={{ minHeight: 70 }} />
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-16">
          <div className="card">
            <div className="card-header"><ZapIcon size={15} color="var(--teal)" /><span className="card-title">Work Experience ({(pp.experience ?? []).length})</span></div>
            <div className="card-body flex flex-col gap-12">
              {(pp.experience ?? []).map((exp, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div className="grid-2" style={{ gap: 8, marginBottom: 6 }}>
                    <input className="form-input" placeholder="Role (e.g. Research Engineer)" value={exp.role}
                      onChange={e => patchProfile({ experience: (pp.experience ?? []).map((x, j) => j === i ? { ...x, role: e.target.value } : x) })}
                      style={{ fontWeight: 600 }} />
                    <input className="form-input" placeholder="Company / Lab" value={exp.company}
                      onChange={e => patchProfile({ experience: (pp.experience ?? []).map((x, j) => j === i ? { ...x, company: e.target.value } : x) })} />
                  </div>
                  <div className="flex gap-8" style={{ marginBottom: 6 }}>
                    <input className="form-input flex-1" placeholder="Duration (e.g. 2022 - Present)" value={exp.duration}
                      onChange={e => patchProfile({ experience: (pp.experience ?? []).map((x, j) => j === i ? { ...x, duration: e.target.value } : x) })} />
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => patchProfile({ experience: (pp.experience ?? []).filter((_, j) => j !== i) })}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <textarea className="form-textarea" placeholder="Responsibilities & achievements" value={exp.description}
                    onChange={e => patchProfile({ experience: (pp.experience ?? []).map((x, j) => j === i ? { ...x, description: e.target.value } : x) })}
                    style={{ minHeight: 60 }} />
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => patchProfile({ experience: [...(pp.experience ?? []), { role: '', company: '', duration: '', description: '' }] })}>
                <PlusIcon size={13} />Add Experience
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><GraduationCapIcon size={15} color="var(--accent-light)" /><span className="card-title">Education ({(pp.education ?? []).length})</span></div>
            <div className="card-body flex flex-col gap-12">
              {(pp.education ?? []).map((edu, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div className="grid-2" style={{ gap: 8, marginBottom: 6 }}>
                    <input className="form-input" placeholder="Degree (e.g. M.Sc. Robotics)" value={edu.degree}
                      onChange={e => patchProfile({ education: (pp.education ?? []).map((x, j) => j === i ? { ...x, degree: e.target.value } : x) })}
                      style={{ fontWeight: 600 }} />
                    <input className="form-input" placeholder="Institution / University" value={edu.institution}
                      onChange={e => patchProfile({ education: (pp.education ?? []).map((x, j) => j === i ? { ...x, institution: e.target.value } : x) })} />
                  </div>
                  <div className="flex gap-8" style={{ marginBottom: 6 }}>
                    <input className="form-input flex-1" placeholder="Duration (e.g. 2020 - 2022) · GPA if any" value={edu.duration}
                      onChange={e => patchProfile({ education: (pp.education ?? []).map((x, j) => j === i ? { ...x, duration: e.target.value } : x) })} />
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => patchProfile({ education: (pp.education ?? []).filter((_, j) => j !== i) })}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <textarea className="form-textarea" placeholder="Courses, thesis, highlights…" value={edu.description}
                    onChange={e => patchProfile({ education: (pp.education ?? []).map((x, j) => j === i ? { ...x, description: e.target.value } : x) })}
                    style={{ minHeight: 60 }} />
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => patchProfile({ education: [...(pp.education ?? []), { degree: '', institution: '', duration: '', description: '' }] })}>
                <PlusIcon size={13} />Add Education
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><ZapIcon size={15} color="var(--warning)" /><span className="card-title">Projects ({(pp.projects ?? []).length})</span></div>
            <div className="card-body flex flex-col gap-12">
              {(pp.projects ?? []).map((proj, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div className="flex items-center justify-between">
                    <input className="form-input" value={proj.title}
                      onChange={e => patchProfile({ projects: (pp.projects ?? []).map((x, j) => j === i ? { ...x, title: e.target.value } : x) })}
                      style={{ fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', marginBottom: 6 }} />
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => patchProfile({ projects: (pp.projects ?? []).filter((_, j) => j !== i) })}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <textarea className="form-textarea" value={proj.description}
                    onChange={e => patchProfile({ projects: (pp.projects ?? []).map((x, j) => j === i ? { ...x, description: e.target.value } : x) })}
                    style={{ minHeight: 60, marginBottom: 6 }} />
                  <div className="flex flex-wrap gap-4">
                    {(proj.technologies ?? []).map(t => <span key={t} className="keyword-tag neutral">{t}</span>)}
                  </div>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => patchProfile({ projects: [...(pp.projects ?? []), { title: 'New Project', technologies: [], description: '' }] })}>
                <PlusIcon size={13} />Add Project
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><BookOpenIcon size={15} color="var(--accent-light)" /><span className="card-title">Publications ({(pp.publications ?? []).length})</span></div>
            <div className="card-body flex flex-col gap-12">
              {(pp.publications ?? []).map((pub, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div className="flex items-center justify-between">
                    <input className="form-input" value={pub.title}
                      onChange={e => patchProfile({ publications: (pp.publications ?? []).map((x, j) => j === i ? { ...x, title: e.target.value } : x) })}
                      style={{ fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', marginBottom: 6 }} />
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => patchProfile({ publications: (pp.publications ?? []).filter((_, j) => j !== i) })}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <div className="grid-2" style={{ gap: 8, marginBottom: 6 }}>
                    <input className="form-input" placeholder="Authors" value={pub.authors}
                      onChange={e => patchProfile({ publications: (pp.publications ?? []).map((x, j) => j === i ? { ...x, authors: e.target.value } : x) })} />
                    <input className="form-input" placeholder="Journal / Venue" value={pub.journal}
                      onChange={e => patchProfile({ publications: (pp.publications ?? []).map((x, j) => j === i ? { ...x, journal: e.target.value } : x) })} />
                  </div>
                  <textarea className="form-textarea" value={pub.abstract}
                    onChange={e => patchProfile({ publications: (pp.publications ?? []).map((x, j) => j === i ? { ...x, abstract: e.target.value } : x) })}
                    style={{ minHeight: 60 }} />
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => patchProfile({ publications: [...(pp.publications ?? []), { title: 'New Publication', authors: '', journal: '', year: new Date().getFullYear(), abstract: '' }] })}>
                <PlusIcon size={13} />Add Publication
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><ListIcon size={15} color="var(--accent-light)" /><span className="card-title">Other Sections ({(pp.additional_sections ?? []).length})</span></div>
            <div className="card-body flex flex-col gap-8">
              <p className="text-xs text-muted">Any resume section that doesn't fit the standard fields — volunteering, workshops, extracurricular, references — is kept here automatically.</p>
              <AdditionalSectionsEditor items={pp.additional_sections ?? []} onChange={additional_sections => patchProfile({ additional_sections })} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
