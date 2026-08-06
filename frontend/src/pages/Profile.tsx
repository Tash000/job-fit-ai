import { useState, useEffect } from 'react'
import {
  UserIcon, SparklesIcon, CpuIcon, BookOpenIcon, ZapIcon,
  SaveIcon, PlusIcon, TrashIcon, ClipboardPasteIcon,
} from 'lucide-react'
import { API_BASE as API } from '../lib/api'
import type { Notify, Profile as ProfileData } from '../lib/types'
import { LoadingBlock } from '../components/ui'

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE VIEW
// ══════════════════════════════════════════════════════════════════════════════

export function ProfileView({ notify }: { notify: Notify }) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [showPasteText, setShowPasteText] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [parsingText, setParsingText] = useState(false)

  useEffect(() => {
    fetch(`${API}/api/profile`)
      .then(r => r.json())
      .then(d => setProfile(d && d.resume_text !== undefined ? d : null))
      .catch(() => setProfile(null))
  }, [])

  async function save() {
    if (!profile) return
    setSaving(true)
    try {
      await fetch(`${API}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      notify('Profile saved', 'success')
    } catch { notify('Save failed', 'error') }
    finally { setSaving(false) }
  }

  async function uploadPDF(file: File) {
    if (!file.name.endsWith('.pdf')) { notify('Only PDF files are supported', 'error'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`${API}/api/profile/upload-resume`, { method: 'POST', body: fd })
      const d = await r.json()
      setProfile({ resume_text: d.resume_text, parsed_profile: d.parsed_profile })
      notify('AI parsed your resume — check the fields below', 'success')
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
      setShowPasteText(false)
      setPasteText('')
      notify('AI parsed your resume — check the fields below', 'success')
    } catch { notify('Parsing failed', 'error') }
    finally { setParsingText(false) }
  }

  if (!profile) return <LoadingBlock label="Loading profile…" />

  const pp = profile.parsed_profile

  return (
    <div className="flex flex-col gap-20 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2>My Profile</h2>
          <p className="text-sm text-secondary">Your resume powers every analysis — keep it up to date.</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><div className="spinner" />Saving…</> : <><SaveIcon size={15} />Save Profile</>}
        </button>
      </div>

      <div className="split-layout-wide">
        {/* Left: personal + skills */}
        <div className="flex flex-col gap-16">
          {/* PDF Upload */}
          <div
            className={`upload-zone ${drag ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) uploadPDF(f) }}
            onClick={() => document.getElementById('pdf-upload')?.click()}
          >
            <input id="pdf-upload" type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadPDF(f) }} />
            {uploading
              ? <><div className="spinner spinner-lg" style={{ margin: '0 auto 8px' }} /><p className="text-sm text-muted">AI is parsing your resume…</p></>
              : <><SparklesIcon size={24} color="var(--accent-light)" style={{ margin: '0 auto 8px' }} /><p className="text-sm text-muted">Drop PDF here or click to upload</p><p className="text-xs text-muted" style={{ marginTop: 4 }}>AI extracts name, email, skills, projects, publications</p></>}
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
              {[
                ['name', 'Full Name', 'Dr. Thousi Yousi'],
                ['email', 'Email', 'yousi@example.com'],
                ['phone', 'Phone', '+49 123 456789'],
              ].map(([k, label, ph]) => (
                <div key={k} className="form-group">
                  <label className="form-label">{label}</label>
                  <input className="form-input" placeholder={ph}
                    value={(pp as unknown as Record<string, string>)[k] ?? ''}
                    onChange={e => setProfile(p => p ? {
                      ...p, parsed_profile: { ...p.parsed_profile, [k]: e.target.value }
                    } : p)} />
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Career Goals</label>
                <textarea className="form-textarea" placeholder="e.g. Robotics researcher specializing in…"
                  value={pp.career_goals ?? ''}
                  onChange={e => setProfile(p => p ? {
                    ...p, parsed_profile: { ...p.parsed_profile, career_goals: e.target.value }
                  } : p)} style={{ minHeight: 80 }} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><CpuIcon size={15} color="var(--teal)" /><span className="card-title">Skills</span></div>
            <div className="card-body flex flex-col gap-8">
              <div className="flex flex-wrap gap-6">
                {pp.skills.map((s, i) => (
                  <div key={i} className="keyword-tag neutral" style={{ cursor: 'pointer', gap: 6 }}>
                    {s}
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, lineHeight: 1 }}
                      onClick={() => setProfile(p => p ? {
                        ...p, parsed_profile: { ...p.parsed_profile, skills: p.parsed_profile.skills.filter((_, j) => j !== i) }
                      } : p)}>×</button>
                  </div>
                ))}
              </div>
              <SkillAdder onAdd={skill => setProfile(p => p ? {
                ...p, parsed_profile: { ...p.parsed_profile, skills: [...p.parsed_profile.skills, skill] }
              } : p)} />
            </div>
          </div>
        </div>

        {/* Right: projects + publications + resume */}
        <div className="flex flex-col gap-16">
          <div className="card">
            <div className="card-header"><ZapIcon size={15} color="var(--warning)" /><span className="card-title">Projects ({pp.projects.length})</span></div>
            <div className="card-body flex flex-col gap-12">
              {pp.projects.map((proj, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div className="flex items-center justify-between">
                    <input className="form-input" value={proj.title}
                      onChange={e => setProfile(p => p ? {
                        ...p, parsed_profile: {
                          ...p.parsed_profile,
                          projects: p.parsed_profile.projects.map((x, j) => j === i ? { ...x, title: e.target.value } : x)
                        }
                      } : p)}
                      style={{ fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', marginBottom: 6 }} />
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => setProfile(p => p ? {
                      ...p, parsed_profile: { ...p.parsed_profile, projects: p.parsed_profile.projects.filter((_, j) => j !== i) }
                    } : p)}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <textarea className="form-textarea" value={proj.description}
                    onChange={e => setProfile(p => p ? {
                      ...p, parsed_profile: {
                        ...p.parsed_profile,
                        projects: p.parsed_profile.projects.map((x, j) => j === i ? { ...x, description: e.target.value } : x)
                      }
                    } : p)}
                    style={{ minHeight: 60, marginBottom: 6 }} />
                  <div className="flex flex-wrap gap-4">
                    {proj.technologies.map(t => <span key={t} className="keyword-tag neutral">{t}</span>)}
                  </div>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setProfile(p => p ? {
                ...p, parsed_profile: {
                  ...p.parsed_profile,
                  projects: [...p.parsed_profile.projects, { title: 'New Project', technologies: [], description: '' }]
                }
              } : p)}>
                <PlusIcon size={13} />Add Project
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><BookOpenIcon size={15} color="var(--accent-light)" /><span className="card-title">Publications</span></div>
            <div className="card-body flex flex-col gap-12">
              {pp.publications.map((pub, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <div className="flex items-center justify-between">
                    <input className="form-input" value={pub.title}
                      onChange={e => setProfile(p => p ? {
                        ...p, parsed_profile: {
                          ...p.parsed_profile,
                          publications: p.parsed_profile.publications.map((x, j) => j === i ? { ...x, title: e.target.value } : x)
                        }
                      } : p)}
                      style={{ fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', marginBottom: 6 }} />
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => setProfile(p => p ? {
                      ...p, parsed_profile: { ...p.parsed_profile, publications: p.parsed_profile.publications.filter((_, j) => j !== i) }
                    } : p)}>
                      <TrashIcon size={12} />
                    </button>
                  </div>
                  <div className="grid-2" style={{ gap: 8, marginBottom: 6 }}>
                    <input className="form-input" placeholder="Authors" value={pub.authors}
                      onChange={e => setProfile(p => p ? {
                        ...p, parsed_profile: {
                          ...p.parsed_profile,
                          publications: p.parsed_profile.publications.map((x, j) => j === i ? { ...x, authors: e.target.value } : x)
                        }
                      } : p)} />
                    <input className="form-input" placeholder="Journal / Venue" value={pub.journal}
                      onChange={e => setProfile(p => p ? {
                        ...p, parsed_profile: {
                          ...p.parsed_profile,
                          publications: p.parsed_profile.publications.map((x, j) => j === i ? { ...x, journal: e.target.value } : x)
                        }
                      } : p)} />
                  </div>
                  <textarea className="form-textarea" value={pub.abstract}
                    onChange={e => setProfile(p => p ? {
                      ...p, parsed_profile: {
                        ...p.parsed_profile,
                        publications: p.parsed_profile.publications.map((x, j) => j === i ? { ...x, abstract: e.target.value } : x)
                      }
                    } : p)}
                    style={{ minHeight: 60 }} />
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setProfile(p => p ? {
                ...p, parsed_profile: {
                  ...p.parsed_profile,
                  publications: [...p.parsed_profile.publications, { title: 'New Publication', authors: '', journal: '', year: new Date().getFullYear(), abstract: '' }]
                }
              } : p)}>
                <PlusIcon size={13} />Add Publication
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkillAdder({ onAdd }: { onAdd: (s: string) => void }) {
  const [val, setVal] = useState('')
  return (
    <div className="flex gap-6">
      <input className="form-input flex-1" placeholder="Add skill (e.g. ROS2)" value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal('') } }} />
      <button className="btn btn-secondary btn-sm" onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal('') } }}>
        <PlusIcon size={14} />Add
      </button>
    </div>
  )
}
