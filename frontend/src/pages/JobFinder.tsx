import React, { useState, useEffect, useCallback } from 'react'
import {
  CompassIcon, SearchIcon, ExternalLinkIcon, CopyIcon, CheckIcon,
  SparklesIcon, RefreshCwIcon, MapPinIcon, ShieldCheckIcon,
  BotIcon, ArrowRightIcon, ArrowLeftIcon, FileTextIcon, BookmarkPlusIcon
} from 'lucide-react'

interface BoardItem {
  id: string
  name: string
  category: string
  badge: string
  description: string
  tips: string
  search_url: string
  query_used?: string
}

interface ProfileRecs {
  primary_title: string
  secondary_titles: string[]
  detected_skills: string[]
  recommended_keywords: string[]
  standard_query: string
  boolean_query: string
}

interface AgentLog {
  agent: string
  action: string
}

interface PipelineResult {
  role_title: string
  company_name: string
  ats_score: number
  keyword_matches: string[]
  missing_keywords: string[]
  grounded_chunks: Array<{ tag: string; title: string; content: string; score: number }>
  cover_letter: string
  truth_audits: Array<{ claim: string; verified: boolean; citation?: string }>
  iterations_completed: number
  is_approved: boolean
  agent_logs: AgentLog[]
}

interface JobFinderProps {
  onNavigateToApps?: (appId?: number) => void
  notify?: (msg: string, type?: 'info' | 'success' | 'error') => void
}

type FinderTab = 'boards' | 'copilot' | 'report'

export function JobFinderView({ onNavigateToApps, notify }: JobFinderProps) {
  const [activeTab, setActiveTab] = useState<FinderTab>('boards')
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileRecs | null>(null)
  const [boards, setBoards] = useState<BoardItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [location, setLocation] = useState('remote')
  const [copiedQuery, setCopiedQuery] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [updatingSearches, setUpdatingSearches] = useState(false)

  // Pipeline agent runner state
  const [jobText, setJobText] = useState('')
  const [companyInput, setCompanyInput] = useState('')
  const [roleInput, setRoleInput] = useState('')
  const [agentRunning, setAgentRunning] = useState(false)
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [copiedLetter, setCopiedLetter] = useState(false)
  const [savingApp, setSavingApp] = useState(false)
  const [reportSubTab, setReportSubTab] = useState<'letter' | 'keywords' | 'audit'>('letter')

  const loadPersonalizedRecs = useCallback(async (loc = location) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/jobs/personalized-recommendations?location=${encodeURIComponent(loc)}`)
      if (res.ok) {
        const data = await res.json()
        setProfile(data.profile)
        setBoards(data.board_links || [])
        setSearchQuery((prev) => prev || (data.profile?.standard_query || ''))
      }
    } catch {
      // Degrade gracefully
    } finally {
      setLoading(false)
    }
  }, [location])

  useEffect(() => {
    void loadPersonalizedRecs()
  }, [loadPersonalizedRecs])

  const handleUpdateSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setUpdatingSearches(true)
    try {
      const res = await fetch('/api/jobs/generate-board-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, location }),
      })
      if (res.ok) {
        const data = await res.json()
        setBoards(data.board_links || [])
        notify?.(`Search links updated for "${searchQuery}"`, 'success')
      }
    } catch {
      notify?.('Failed to refresh search links', 'error')
    } finally {
      setUpdatingSearches(false)
    }
  }

  const handleOpenBoard = (b: BoardItem) => {
    window.open(b.search_url, '_blank', 'noopener,noreferrer')
    notify?.(`Opened ${b.name} in a new tab`, 'info')
  }

  const handleCopy = (text: string, type: 'query' | 'url', urlId?: string) => {
    navigator.clipboard.writeText(text)
    if (type === 'query') {
      setCopiedQuery(true)
      setTimeout(() => setCopiedQuery(false), 2000)
    } else if (urlId) {
      setCopiedUrl(urlId)
      setTimeout(() => setCopiedUrl(null), 2000)
    }
    notify?.('Copied to clipboard!', 'success')
  }

  const handleRunAgentPipeline = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jobText.trim()) return

    setAgentRunning(true)
    setPipelineError(null)

    try {
      const res = await fetch('/api/pipeline/run-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_text: jobText,
          company_name: companyInput.trim() || undefined,
          role_title: roleInput.trim() || undefined,
          max_iterations: 2,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Could not complete agent audit')
      }
      const data: PipelineResult = await res.json()
      setPipelineResult(data)
      setActiveTab('report')
      notify?.(`Audit completed for ${data.role_title} at ${data.company_name}!`, 'success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error executing agent pipeline'
      setPipelineError(msg)
      notify?.(msg, 'error')
    } finally {
      setAgentRunning(false)
    }
  }

  const handleSaveToApplications = async () => {
    if (!pipelineResult) return
    setSavingApp(true)
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: pipelineResult.company_name || 'Target Company',
          position: pipelineResult.role_title || 'Target Role',
          location: location || 'Remote',
          description: jobText,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail?.message || err.detail || 'Could not save application')
      }
      const app = await res.json()
      notify?.(`Saved "${pipelineResult.role_title}" to Applications!`, 'success')
      if (onNavigateToApps) {
        onNavigateToApps(app.id)
      }
    } catch (err: unknown) {
      notify?.(err instanceof Error ? err.message : 'Error saving to applications', 'error')
    } finally {
      setSavingApp(false)
    }
  }

  const filteredBoards = boards.filter((b) => {
    if (activeCategory === 'all') return true
    return b.category === activeCategory
  })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px 80px' }}>
      {/* ── Top Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 'var(--radius-full)', background: 'var(--brand-50)', border: '1px solid var(--brand-200)', marginBottom: 12 }}>
          <CompassIcon size={14} color="var(--color-primary)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Job Search & Multi-Agent Copilot
          </span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: 'var(--font-weight-bold)', margin: '0 0 8px', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
          Find Jobs That Fit Your Experience
        </h1>
        <p style={{ margin: 0, fontSize: '0.96rem', color: 'var(--text-muted)', maxWidth: 720, lineHeight: 1.5 }}>
          Search curated job portals with personalized keywords mined from your resume, or paste any listing to run our 5-agent LangGraph team for deep ATS matching and verified cover letters.
        </p>
      </div>

      {/* ── Top Navigation Tabs (Mode Switcher) ── */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '2px solid var(--color-border)', marginBottom: 28, paddingBottom: 2, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('boards')}
          className={`btn-bubble ${activeTab === 'boards' ? 'active' : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'boards' ? '3px solid var(--color-primary)' : '3px solid transparent',
            background: activeTab === 'boards' ? 'var(--brand-50)' : 'transparent',
            color: activeTab === 'boards' ? 'var(--color-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'boards' ? 650 : 500,
            fontSize: '0.92rem',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <SearchIcon size={16} />
          Browse Job Boards (1-Click Searches)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('copilot')}
          className={`btn-bubble ${activeTab === 'copilot' ? 'active' : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'copilot' ? '3px solid var(--color-primary)' : '3px solid transparent',
            background: activeTab === 'copilot' ? 'var(--brand-50)' : 'transparent',
            color: activeTab === 'copilot' ? 'var(--color-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'copilot' ? 650 : 500,
            fontSize: '0.92rem',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <BotIcon size={16} />
          AI Job Copilot (LangGraph 5-Agent Audit)
        </button>

        {pipelineResult && (
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`btn-bubble ${activeTab === 'report' ? 'active' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              border: 'none',
              borderBottom: activeTab === 'report' ? '3px solid var(--color-primary)' : '3px solid transparent',
              background: activeTab === 'report' ? 'var(--brand-50)' : 'transparent',
              color: activeTab === 'report' ? 'var(--color-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'report' ? 650 : 500,
              fontSize: '0.92rem',
              borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <ShieldCheckIcon size={16} />
            Live Audit Report ({pipelineResult.ats_score}%)
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 1: BROWSE JOB BOARDS
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'boards' && (
        <div>
          {/* Resume Keyword Miner Card */}
          {loading && !profile && (
            <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '28px', marginBottom: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCwIcon size={22} className="spin" style={{ marginBottom: 10, display: 'inline-block', color: 'var(--color-primary)' }} />
              <p style={{ margin: 0, fontSize: '0.92rem' }}>Mining your resume stack to personalize search queries across top boards...</p>
            </div>
          )}

          {profile && (
            <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '22px 24px', marginBottom: 24, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
                    Resume Search Profile
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 650, color: 'var(--color-foreground)' }}>
                    Primary Target: <span style={{ color: 'var(--color-primary)' }}>{profile.primary_title}</span>
                  </div>
                </div>
                {profile.secondary_titles.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {profile.secondary_titles.map((t, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="btn btn-secondary btn-bubble"
                        onClick={() => {
                          setSearchQuery(`${t} ${location}`)
                          notify?.(`Set search query to: ${t}`, 'info')
                        }}
                        style={{ padding: '4px 12px', fontSize: '0.78rem', borderRadius: 'var(--radius-md)' }}
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Detected ATS Skills
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {profile.detected_skills.map((s, idx) => (
                      <span key={idx} style={{ background: 'var(--brand-50)', border: '1px solid var(--brand-200)', borderRadius: 'var(--radius-sm)', padding: '3px 9px', fontSize: '0.76rem', fontFamily: 'var(--font-mono)', color: 'var(--brand-700)' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Recruiter Keyword Boosters
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {profile.recommended_keywords.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="btn btn-ghost btn-bubble"
                        onClick={() => setSearchQuery((prev) => `${prev} ${s}`)}
                        style={{ border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '3px 9px', fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}
                        title="Click to append to search query"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {profile.boolean_query && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                      Recruiter Boolean Search String
                    </span>
                    <code style={{ fontSize: '0.78rem', background: 'var(--color-muted)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {profile.boolean_query}
                    </code>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-bubble"
                    onClick={() => handleCopy(profile.boolean_query, 'query')}
                    style={{ gap: 6, padding: '7px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.82rem' }}
                  >
                    {copiedQuery ? <CheckIcon size={14} color="var(--success)" /> : <CopyIcon size={14} />}
                    {copiedQuery ? 'Copied Boolean' : 'Copy Boolean'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search Bar Controls */}
          <form onSubmit={handleUpdateSearch} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22, background: 'var(--color-card)', padding: '16px 20px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ flex: 2, minWidth: 260, position: 'relative' }}>
              <SearchIcon size={17} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search keywords (e.g. Senior Backend Engineer Python FastAPI)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 40px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-muted)', color: 'var(--color-foreground)', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
              <MapPinIcon size={17} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (e.g. remote, US)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 40px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-muted)', color: 'var(--color-foreground)', fontSize: '0.9rem' }}
              />
            </div>

            <button
              type="submit"
              disabled={updatingSearches}
              className="btn btn-primary btn-bubble"
              style={{ padding: '10px 22px', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', fontWeight: 650 }}
            >
              <RefreshCwIcon size={16} className={updatingSearches ? 'spin' : ''} />
              {updatingSearches ? 'Updating...' : 'Update Board Searches'}
            </button>
          </form>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { id: 'all', label: 'All Curated Boards' },
              { id: 'tech_startups', label: 'Tech & Startups' },
              { id: 'remote_first', label: '100% Remote' },
              { id: 'general', label: 'General / Enterprise' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="btn-bubble"
                onClick={() => setActiveCategory(tab.id)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.84rem',
                  fontWeight: 550,
                  cursor: 'pointer',
                  border: activeCategory === tab.id ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: activeCategory === tab.id ? 'var(--color-primary)' : 'var(--color-card)',
                  color: activeCategory === tab.id ? '#fff' : 'var(--color-foreground)',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Job Board Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
            {filteredBoards.map((b) => (
              <div
                key={b.id}
                style={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '20px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'var(--ease)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-foreground)' }}>{b.name}</h3>
                    {b.badge && (
                      <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--brand-50)', color: 'var(--brand-700)', border: '1px solid var(--brand-200)', fontWeight: 600 }}>
                        {b.badge}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 12px', fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    {b.description}
                  </p>
                  {b.tips && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'var(--color-muted)', padding: '8px 12px', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
                      💡 <strong>Tip:</strong> {b.tips}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenBoard(b)}
                    className="btn btn-primary btn-bubble"
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      padding: '9px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.84rem',
                      fontWeight: 650,
                    }}
                    title={`Open live search on ${b.name}`}
                  >
                    Search on {b.name} <ExternalLinkIcon size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(b.search_url, 'url', b.id)}
                    className="btn btn-secondary btn-bubble"
                    style={{
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.82rem',
                    }}
                    title="Copy direct search URL"
                  >
                    {copiedUrl === b.id ? <CheckIcon size={14} color="var(--success)" /> : <CopyIcon size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 2: AI JOB COPILOT (LangGraph Input Form)
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'copilot' && (
        <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '32px 28px', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <SparklesIcon size={22} color="var(--color-primary)" />
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 650, color: 'var(--color-foreground)' }}>
              Audit Any Job with 5 Autonomous AI Agents
            </h2>
          </div>
          <p style={{ margin: '0 0 24px', fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 800 }}>
            Found an exciting job listing from the boards or anywhere else? Paste its text below. Our 5-agent LangGraph pipeline will extract core requirements, cross-check against your grounded resume chunks, score your ATS match, and compose a personalized, hallucination-free cover letter.
          </p>

          <form onSubmit={handleRunAgentPipeline}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
              <div>
                <label className="form-label" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  COMPANY NAME (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={companyInput}
                  onChange={(e) => setCompanyInput(e.target.value)}
                  placeholder="e.g. NextGen Robotics Lab"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-muted)', color: 'var(--color-foreground)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  TARGET ROLE TITLE (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-muted)', color: 'var(--color-foreground)', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label className="form-label" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                JOB POSTING TEXT / REQUIREMENTS *
              </label>
              <textarea
                rows={7}
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                placeholder="Paste the full job description or key responsibilities here..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-muted)',
                  color: 'var(--color-foreground)',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                ⚡ 5 agents: RequirementExtractor → RAGRetriever → ATSEvaluator → HumanCopyWriter → TruthfulnessCritic
              </span>
              <button
                type="submit"
                disabled={agentRunning || !jobText.trim()}
                className="btn btn-primary btn-bubble"
                style={{
                  padding: '12px 28px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.94rem',
                  fontWeight: 650,
                  cursor: agentRunning ? 'wait' : 'pointer',
                }}
              >
                {agentRunning ? (
                  <>
                    <RefreshCwIcon size={17} className="spin" />
                    5 Agents Auditing & Writing...
                  </>
                ) : (
                  <>
                    <BotIcon size={17} />
                    Launch 5-Agent Audit
                  </>
                )}
              </button>
            </div>
          </form>

          {pipelineError && (
            <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '0.88rem' }}>
              <strong>Error:</strong> {pipelineError}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 3: LIVE AUDIT REPORT (Dedicated Results Page View)
          ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'report' && pipelineResult && (
        <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '32px 30px', boxShadow: 'var(--shadow-md)' }}>
          {/* Top Return & Save Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24, paddingBottom: 18, borderBottom: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className="btn btn-ghost btn-bubble"
              onClick={() => setActiveTab('copilot')}
              style={{ gap: 6, fontSize: '0.85rem' }}
            >
              <ArrowLeftIcon size={14} /> Back to Job Copilot
            </button>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-bubble"
                onClick={() => {
                  navigator.clipboard.writeText(pipelineResult.cover_letter)
                  setCopiedLetter(true)
                  setTimeout(() => setCopiedLetter(false), 2000)
                  notify?.('Cover letter copied to clipboard!', 'success')
                }}
                style={{ gap: 6, fontSize: '0.85rem' }}
              >
                {copiedLetter ? <CheckIcon size={14} color="var(--success)" /> : <CopyIcon size={14} />}
                {copiedLetter ? 'Copied Letter' : 'Copy Cover Letter'}
              </button>

              <button
                type="button"
                disabled={savingApp}
                className="btn btn-primary btn-bubble"
                onClick={handleSaveToApplications}
                style={{ gap: 8, fontSize: '0.88rem', fontWeight: 650 }}
              >
                <BookmarkPlusIcon size={15} />
                {savingApp ? 'Saving Application...' : 'Save & Track in Applications'}
              </button>
            </div>
          </div>

          {/* Report Header Card */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18, marginBottom: 28 }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Multi-Agent Audit Completed ({pipelineResult.iterations_completed} Iterations)
              </span>
              <h2 style={{ margin: '4px 0 2px', fontFamily: 'var(--font-display)', fontSize: '1.65rem', color: 'var(--color-foreground)', letterSpacing: '-0.015em' }}>
                {pipelineResult.role_title} at {pipelineResult.company_name}
              </h2>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Location: {location || 'Remote'} · Verified with LangGraph RAG Engine
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  ATS MATCH SCORE
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: pipelineResult.ats_score > 70 ? 'var(--color-primary)' : 'var(--warning)', lineHeight: 1 }}>
                  {pipelineResult.ats_score}%
                </div>
              </div>
              <div style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', background: pipelineResult.is_approved ? 'var(--brand-50)' : 'var(--warning-bg)', color: pipelineResult.is_approved ? 'var(--brand-700)' : 'var(--warning)', border: `1px solid ${pipelineResult.is_approved ? 'var(--brand-200)' : 'var(--warning-border)'}`, fontSize: '0.82rem', fontWeight: 650 }}>
                {pipelineResult.is_approved ? '✓ Truth-Verified' : '⚠ Revised by Critic'}
              </div>
            </div>
          </div>

          {/* Report Section Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 22, borderBottom: '1px solid var(--color-border)', paddingBottom: 2 }}>
            <button
              type="button"
              onClick={() => setReportSubTab('letter')}
              className={`btn-bubble ${reportSubTab === 'letter' ? 'active' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                border: 'none',
                borderBottom: reportSubTab === 'letter' ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
                background: reportSubTab === 'letter' ? 'var(--color-muted)' : 'transparent',
                color: reportSubTab === 'letter' ? 'var(--color-primary)' : 'var(--text-muted)',
                fontWeight: reportSubTab === 'letter' ? 650 : 500,
                fontSize: '0.86rem',
                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                cursor: 'pointer',
              }}
            >
              <FileTextIcon size={14} />
              Grounded Cover Letter
            </button>

            <button
              type="button"
              onClick={() => setReportSubTab('keywords')}
              className={`btn-bubble ${reportSubTab === 'keywords' ? 'active' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                border: 'none',
                borderBottom: reportSubTab === 'keywords' ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
                background: reportSubTab === 'keywords' ? 'var(--color-muted)' : 'transparent',
                color: reportSubTab === 'keywords' ? 'var(--color-primary)' : 'var(--text-muted)',
                fontWeight: reportSubTab === 'keywords' ? 650 : 500,
                fontSize: '0.86rem',
                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                cursor: 'pointer',
              }}
            >
              <CheckIcon size={14} />
              Keyword Coverage ({pipelineResult.keyword_matches.length} Matched)
            </button>

            <button
              type="button"
              onClick={() => setReportSubTab('audit')}
              className={`btn-bubble ${reportSubTab === 'audit' ? 'active' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                border: 'none',
                borderBottom: reportSubTab === 'audit' ? '2.5px solid var(--color-primary)' : '2.5px solid transparent',
                background: reportSubTab === 'audit' ? 'var(--color-muted)' : 'transparent',
                color: reportSubTab === 'audit' ? 'var(--color-primary)' : 'var(--text-muted)',
                fontWeight: reportSubTab === 'audit' ? 650 : 500,
                fontSize: '0.86rem',
                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                cursor: 'pointer',
              }}
            >
              <ShieldCheckIcon size={14} />
              5-Agent Audit Trail ({pipelineResult.agent_logs.length} Steps)
            </button>
          </div>

          {/* Subtab 1: Grounded Cover Letter */}
          {reportSubTab === 'letter' && (
            <div>
              <div style={{ whiteSpace: 'pre-wrap', background: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '22px 26px', fontSize: '0.92rem', lineHeight: 1.65, color: 'var(--color-foreground)', marginBottom: 20 }}>
                {pipelineResult.cover_letter}
              </div>

              {pipelineResult.truth_audits && pipelineResult.truth_audits.length > 0 && (
                <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginTop: 16 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                    Fact-Check Verification Summary
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pipelineResult.truth_audits.map((audit, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.84rem' }}>
                        <span style={{ color: audit.verified ? 'var(--color-primary)' : 'var(--warning)', fontWeight: 700 }}>
                          {audit.verified ? '✓' : '⚠'}
                        </span>
                        <span style={{ color: 'var(--color-foreground)' }}>{audit.claim}</span>
                        {audit.citation && (
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic', marginLeft: 'auto' }}>
                            [{audit.citation}]
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtab 2: Keyword Coverage */}
          {reportSubTab === 'keywords' && (
            <div>
              <div style={{ marginBottom: 22 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--color-primary)' }}>
                  ✓ Matched Resume Keywords ({pipelineResult.keyword_matches.length})
                </h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {pipelineResult.keyword_matches.map((k, i) => (
                    <span key={i} style={{ background: 'var(--brand-50)', color: 'var(--brand-700)', border: '1px solid var(--brand-200)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                      ✓ {k}
                    </span>
                  ))}
                </div>
              </div>

              {pipelineResult.missing_keywords.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--danger)' }}>
                    ✕ Missing Role Keywords ({pipelineResult.missing_keywords.length})
                  </h4>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {pipelineResult.missing_keywords.map((k, i) => (
                      <span key={i} style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                        ✕ {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtab 3: 5-Agent Audit Trail */}
          {reportSubTab === 'audit' && (
            <div>
              <div style={{ background: 'var(--color-muted)', padding: '16px 20px', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheckIcon size={15} color="var(--color-primary)" /> Multi-Agent Execution Trail
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pipelineResult.agent_logs.map((log, idx) => (
                    <div key={idx} style={{ fontSize: '0.82rem', display: 'flex', gap: 10, color: 'var(--color-foreground)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 650, color: 'var(--color-primary)', minWidth: 180 }}>
                        [{log.agent}]
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{log.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Footer */}
          <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <button
              type="button"
              className="btn btn-ghost btn-bubble"
              onClick={() => {
                setActiveTab('copilot')
                setJobText('')
              }}
              style={{ fontSize: '0.85rem' }}
            >
              + Audit Another Job
            </button>

            {onNavigateToApps && (
              <button
                type="button"
                className="btn btn-primary btn-bubble"
                onClick={handleSaveToApplications}
                style={{ gap: 6, fontSize: '0.88rem' }}
              >
                Go to Applications to track this role <ArrowRightIcon size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default JobFinderView
