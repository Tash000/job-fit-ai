import React, { useState, useEffect, useCallback } from 'react'
import {
  CompassIcon, SearchIcon, ExternalLinkIcon, CopyIcon, CheckIcon,
  SparklesIcon, RefreshCwIcon, MapPinIcon, ShieldCheckIcon,
  BotIcon, ArrowRightIcon
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

export function JobFinderView({ onNavigateToApps }: { onNavigateToApps?: () => void }) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileRecs | null>(null)
  const [boards, setBoards] = useState<BoardItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [location, setLocation] = useState('remote')
  const [copiedQuery, setCopiedQuery] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  // Pipeline agent runner state
  const [jobText, setJobText] = useState('')
  const [agentRunning, setAgentRunning] = useState(false)
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [copiedLetter, setCopiedLetter] = useState(false)

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
    try {
      const res = await fetch('/api/jobs/generate-board-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, location }),
      })
      if (res.ok) {
        const data = await res.json()
        setBoards(data.board_links || [])
      }
    } catch {
      // Fallback
    }
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
  }

  const handleRunAgentPipeline = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jobText.trim()) return

    setAgentRunning(true)
    setPipelineError(null)
    setPipelineResult(null)

    try {
      const res = await fetch('/api/pipeline/run-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_text: jobText, max_iterations: 2 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Could not complete agent audit')
      }
      const data: PipelineResult = await res.json()
      setPipelineResult(data)
    } catch (err: unknown) {
      setPipelineError(err instanceof Error ? err.message : 'Error executing agent pipeline')
    } finally {
      setAgentRunning(false)
    }
  }

  const filteredBoards = boards.filter((b) => {
    if (activeCategory === 'all') return true
    return b.category === activeCategory
  })

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 80px' }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', marginBottom: 12 }}>
          <CompassIcon size={14} color="var(--accent)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Board Directory & Deep Search
          </span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.1rem', fontWeight: 'var(--font-weight-bold)', margin: '0 0 8px', color: 'var(--color-foreground)' }}>
          Find Jobs That Actually Fit You
        </h1>
        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)', maxWidth: 680, lineHeight: 1.5 }}>
          We mined the real experience from your resume to generate exact search terms, recruiter boolean filters, and direct 1-click links across top job boards.
        </p>
      </div>

      {/* ── Search Kit Card ── */}
      {loading && !profile && (
        <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCwIcon size={20} className="spin" style={{ marginBottom: 8, display: 'inline-block' }} />
          <p style={{ margin: 0, fontSize: '0.88rem' }}>Mining your resume keywords and tailoring board search links...</p>
        </div>
      )}

      {profile && (
        <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 28, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
                Detected From Your Resume
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-foreground)' }}>
                Target Role: <span style={{ color: 'var(--accent)' }}>{profile.primary_title}</span>
              </div>
            </div>
            {profile.secondary_titles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {profile.secondary_titles.map((t, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSearchQuery(`${t} ${location}`)
                    }}
                    style={{ background: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: '0.78rem', color: 'var(--color-foreground)', cursor: 'pointer' }}
                  >
                    + {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                YOUR CORE ATS SKILLS
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {profile.detected_skills.map((s, idx) => (
                  <span key={idx} style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                RECRUITER COMPLEMENTARY TERMS
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {profile.recommended_keywords.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSearchQuery((prev) => `${prev} ${s}`)}
                    style={{ background: 'var(--color-card)', border: '1px dashed var(--color-border)', borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--color-foreground)', cursor: 'pointer' }}
                    title="Click to add to search"
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
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  RECRUITER BOOLEAN SEARCH STRING
                </span>
                <code style={{ fontSize: '0.78rem', background: 'var(--color-muted)', padding: '4px 8px', borderRadius: 4, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.boolean_query}
                </code>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(profile.boolean_query, 'query')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-foreground)', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}
              >
                {copiedQuery ? <CheckIcon size={14} color="var(--success)" /> : <CopyIcon size={14} />}
                {copiedQuery ? 'Copied' : 'Copy Boolean Query'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Search Bar Controls ── */}
      <form onSubmit={handleUpdateSearch} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: 2, minWidth: 260, position: 'relative' }}>
          <SearchIcon size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search keywords (e.g. Senior Backend Engineer Python FastAPI)"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 38px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-foreground)', fontSize: '0.9rem' }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
          <MapPinIcon size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (e.g. remote, US)"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 38px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-foreground)', fontSize: '0.9rem' }}
          />
        </div>

        <button
          type="submit"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}
        >
          <RefreshCwIcon size={15} />
          Update Searches
        </button>
      </form>

      {/* ── Category Filter Tabs ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { id: 'all', label: 'All Job Boards' },
          { id: 'tech_startups', label: 'Tech & Startups' },
          { id: 'remote_first', label: '100% Remote' },
          { id: 'general', label: 'General / Enterprise' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveCategory(tab.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: activeCategory === tab.id ? '1px solid var(--accent)' : '1px solid var(--color-border)',
              background: activeCategory === tab.id ? 'var(--accent)' : 'var(--color-card)',
              color: activeCategory === tab.id ? '#fff' : 'var(--color-foreground)',
              transition: 'var(--ease)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Curated Job Board Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 48 }}>
        {filteredBoards.map((b) => (
          <div
            key={b.id}
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-foreground)' }}>{b.name}</h3>
                {b.badge && (
                  <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 999, background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                    {b.badge}
                  </span>
                )}
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {b.description}
              </p>
              {b.tips && (
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', background: 'var(--color-muted)', padding: '6px 10px', borderRadius: 6, marginBottom: 16 }}>
                  💡 <strong>Tip:</strong> {b.tips}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
              <a
                href={b.search_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Search on {b.name} <ExternalLinkIcon size={13} />
              </a>
              <button
                type="button"
                onClick={() => handleCopy(b.search_url, 'url', b.id)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-card)',
                  color: 'var(--color-foreground)',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Copy search link"
              >
                {copiedUrl === b.id ? <CheckIcon size={14} color="var(--success)" /> : <CopyIcon size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Multi-Agent Copilot Integration ── */}
      <div style={{ background: 'var(--color-card)', border: '2px solid var(--accent-border)', borderRadius: 'var(--radius-lg)', padding: '28px 24px', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <SparklesIcon size={20} color="var(--accent)" />
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 650, letterSpacing: '-0.015em', color: 'var(--color-foreground)' }}>
            Found a Listing? Run the LangGraph Multi-Agent Team
          </h2>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Paste any job description you found from the boards above. Our 5-agent pipeline extracts requirements, cross-checks against your verified resume chunks, audits keyword coverage, and drafts a human-friendly letter with zero hallucinations.
        </p>

        <form onSubmit={handleRunAgentPipeline}>
          <textarea
            rows={5}
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            placeholder="Paste job posting text or key responsibilities here..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              fontFamily: 'inherit',
              fontSize: '0.88rem',
              lineHeight: 1.45,
              resize: 'vertical',
              marginBottom: 16,
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              ⚡ 5 agents: RequirementExtractor → RAGRetriever → ATSEvaluator → HumanCopyWriter → TruthfulnessCritic
            </span>
            <button
              type="submit"
              disabled={agentRunning || !jobText.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 24px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: agentRunning ? 'var(--color-border)' : 'var(--accent)',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: agentRunning ? 'wait' : 'pointer',
              }}
            >
              {agentRunning ? (
                <>
                  <RefreshCwIcon size={16} className="spin" />
                  Agents Auditing & Writing...
                </>
              ) : (
                <>
                  <BotIcon size={16} />
                  Launch Agent Audit
                </>
              )}
            </button>
          </div>
        </form>

        {pipelineError && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '0.85rem' }}>
            {pipelineError}
          </div>
        )}

        {/* ── Pipeline Results Display ── */}
        {pipelineResult && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--color-border)' }}>
            {/* Header info */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Pipeline Completed ({pipelineResult.iterations_completed} Iterations)
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: '1.2rem', color: 'var(--color-foreground)' }}>
                  {pipelineResult.role_title} at {pipelineResult.company_name}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>ATS MATCH</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: pipelineResult.ats_score > 70 ? 'var(--success)' : 'var(--accent)' }}>
                    {pipelineResult.ats_score}%
                  </div>
                </div>
                <div style={{ padding: '6px 10px', borderRadius: 6, background: pipelineResult.is_approved ? 'var(--success-bg)' : 'var(--warning-bg)', color: pipelineResult.is_approved ? 'var(--success)' : 'var(--warning)', border: `1px solid ${pipelineResult.is_approved ? 'var(--success-border)' : 'var(--warning-border)'}`, fontSize: '0.76rem', fontWeight: 600 }}>
                  {pipelineResult.is_approved ? 'Truth-Verified' : 'Revised'}
                </div>
              </div>
            </div>

            {/* Keyword badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {pipelineResult.keyword_matches.map((k, i) => (
                <span key={i} style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)', padding: '2px 8px', borderRadius: 4, fontSize: '0.74rem', fontFamily: 'var(--font-mono)' }}>
                  ✓ {k}
                </span>
              ))}
              {pipelineResult.missing_keywords.map((k, i) => (
                <span key={i} style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', padding: '2px 8px', borderRadius: 4, fontSize: '0.74rem', fontFamily: 'var(--font-mono)' }}>
                  ✕ {k}
                </span>
              ))}
            </div>

            {/* Agent Collaboration Trail */}
            <div style={{ background: 'var(--color-muted)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheckIcon size={14} color="var(--accent)" /> Multi-Agent Audit Trail
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pipelineResult.agent_logs.map((log, idx) => (
                  <div key={idx} style={{ fontSize: '0.78rem', display: 'flex', gap: 8, color: 'var(--color-foreground)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)', minWidth: 160 }}>
                      [{log.agent}]
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{log.action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Grounded Cover Letter Draft */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-foreground)' }}>
                  Grounded Cover Letter (Human, Conversational Tone)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(pipelineResult.cover_letter)
                    setCopiedLetter(true)
                    setTimeout(() => setCopiedLetter(false), 2000)
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-card)', fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  {copiedLetter ? <CheckIcon size={13} color="var(--success)" /> : <CopyIcon size={13} />}
                  {copiedLetter ? 'Copied Letter' : 'Copy Letter'}
                </button>
              </div>

              <div style={{ whiteSpace: 'pre-wrap', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '16px 20px', fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--color-foreground)' }}>
                {pipelineResult.cover_letter}
              </div>
            </div>

            {onNavigateToApps && (
              <div style={{ marginTop: 18, textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={onNavigateToApps}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Go to Applications to manage this tracking <ArrowRightIcon size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default JobFinderView
