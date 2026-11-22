import { useState } from 'react'
import {
  FileTextIcon, CheckCircleIcon,
  ArrowRightIcon, SparklesIcon,
  ChevronDownIcon, ChevronUpIcon,
  LockIcon, CompassIcon, ShieldCheckIcon, BotIcon
} from 'lucide-react'
import { AuthPanel } from '../lib/auth'
import { InstallPrompt } from '../components/InstallPrompt'

type RolePreset = 'fullstack' | 'ai' | 'design'

interface RoleData {
  title: string
  skills: string[]
  missing: string[]
  sampleLetter: string
  verifiedChunk: string
  searchQuery: string
}

const PRESETS: Record<RolePreset, RoleData> = {
  fullstack: {
    title: 'Senior Full Stack Engineer',
    skills: ['TypeScript', 'React', 'FastAPI', 'PostgreSQL', 'Docker'],
    missing: ['Kafka', 'Distributed Systems'],
    sampleLetter: "I saw your team is scaling real-time web services. In my recent work, I built async API microservices with FastAPI and React, cutting query response times by 40%. I enjoy making sure features feel fast and clean for real users.",
    verifiedChunk: "Scale AI: Built async microservices with FastAPI & PostgreSQL, cutting response times by 40%.",
    searchQuery: "Senior Full Stack Engineer Python React FastAPI Remote",
  },
  ai: {
    title: 'AI / Machine Learning Engineer',
    skills: ['Python', 'PyTorch', 'RAG', 'Vector Search', 'LangGraph'],
    missing: ['CUDA Kernels', 'Triton'],
    sampleLetter: "Your work on retrieval-augmented agents caught my attention. Recently, I built a grounded vector retrieval pipeline with LangGraph that audits factual assertions before generation, eliminating hallucinations completely.",
    verifiedChunk: "Research Lab: Designed multi-agent RAG workflow with cosine similarity grounding.",
    searchQuery: "AI Engineer LangChain RAG PyTorch Remote",
  },
  design: {
    title: 'Product & Design Systems Lead',
    skills: ['Figma', 'Design Tokens', 'User Research', 'Design Systems', 'HTML/CSS'],
    missing: ['Framer', 'Prototyping'],
    sampleLetter: "I noticed your product is transitioning to a unified multi-platform design language. At my last company, I architected a token-driven design system adopted across 4 squads, reducing UI implementation friction by half.",
    verifiedChunk: "Design Studio: Architected token-based design system across mobile & web platforms.",
    searchQuery: "Lead Product Designer Design Systems Remote",
  },
}

export default function LandingPage() {
  const [view, setView] = useState<'home' | 'auth'>('home')
  const [selectedRole, setSelectedRole] = useState<RolePreset>('fullstack')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  if (view === 'auth') {
    return (
      <div className="auth-screen">
        <AuthPanel onBack={() => setView('home')} />
      </div>
    )
  }

  const role = PRESETS[selectedRole]

  return (
    <div className="landing fade-in">
      {/* ── Apple-Style Nav ── */}
      <header className="landing-nav">
        <a className="landing-logo" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <span className="logo-dot" />
          Vitralume
        </a>
        <nav className="landing-nav-links">
          <a href="#how-it-works" onClick={e => { e.preventDefault(); scrollToId('how-it-works') }}>How It Works</a>
          <a href="#demo" onClick={e => { e.preventDefault(); scrollToId('demo') }}>Live Preview</a>
          <a href="#features" onClick={e => { e.preventDefault(); scrollToId('features') }}>Features</a>
          <a href="#faq" onClick={e => { e.preventDefault(); scrollToId('faq') }}>FAQ</a>
        </nav>
        <div className="landing-nav-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setView('auth')}>Sign in</button>
          <button className="btn btn-primary btn-sm" onClick={() => setView('auth')} style={{ borderRadius: 9999, padding: '7px 18px' }}>
            Get Started Free
          </button>
        </div>
      </header>

      {/* ── Monumental Hero (Apple Keynote Style) ── */}
      <section className="landing-hero">
        <div className="hero-badge">
          <SparklesIcon size={14} />
          Multi-Agent LangGraph AI · Grounded in Real Experience
        </div>

        <h1 className="hero-title">
          Your Job Search.<br />
          <span className="grad-text">Grounded in Reality.</span>
        </h1>

        <p className="hero-sub">
          Stop sending generic ChatGPT cover letters that recruiters toss in 5 seconds.
          Vitralume coordinates a team of 5 specialized agents to scan keywords, verify claims against your actual resume chunks, and discover high-fit openings across top boards.
        </p>

        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" onClick={() => setView('auth')} style={{ borderRadius: 9999, padding: '14px 32px', fontSize: '1rem' }}>
            Start Free — No Credit Card <ArrowRightIcon size={16} />
          </button>
          <button className="btn btn-secondary btn-lg" onClick={() => scrollToId('demo')} style={{ borderRadius: 9999, padding: '14px 28px', fontSize: '1rem' }}>
            Explore Live Demo ↓
          </button>
        </div>

        {/* ── Interactive Role Simulator (Apple Showcase) ── */}
        <div id="demo" style={{ maxWidth: 1020, margin: '54px auto 0', textAlign: 'left' }}>
          {/* Role selector pill tabs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {(['fullstack', 'ai', 'design'] as RolePreset[]).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedRole(key)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 9999,
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: selectedRole === key ? '1px solid #0071E3' : '1px solid var(--color-border)',
                  background: selectedRole === key ? '#0071E3' : 'var(--color-card)',
                  color: selectedRole === key ? '#FFFFFF' : 'var(--color-foreground)',
                  transition: 'all 150ms ease',
                  boxShadow: selectedRole === key ? '0 4px 12px rgba(0, 113, 227, 0.25)' : 'none',
                }}
              >
                {PRESETS[key].title}
              </button>
            ))}
          </div>

          {/* Glass Showcase Frame */}
          <div style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 24,
            padding: '32px 36px',
            boxShadow: '0 20px 50px -15px rgba(0, 0, 0, 0.08)',
          }}>
            {/* Top row: role header & ATS match gauge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, paddingBottom: 24, borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0071E3', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Target Role Detected
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-foreground)' }}>
                  {role.title}
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-muted-foreground)', fontWeight: 600 }}>ATS FIT SCORE</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10B981', lineHeight: 1 }}>94%</div>
                </div>
                <div style={{ padding: '6px 12px', borderRadius: 9999, background: '#DCFCE7', color: '#166534', fontSize: '0.78rem', fontWeight: 700 }}>
                  ✓ Interview Ready
                </div>
              </div>
            </div>

            {/* 5-Agent Pipeline Collaboration Bar */}
            <div style={{ margin: '22px 0', padding: '14px 18px', borderRadius: 14, background: 'var(--color-muted)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: '0.8rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BotIcon size={16} color="#0071E3" /> LangGraph 5-Agent Team:
              </span>
              <span style={{ color: '#0071E3', fontWeight: 600 }}>1. RequirementExtractor</span> →
              <span style={{ color: '#0071E3', fontWeight: 600 }}>2. RAGRetriever</span> →
              <span style={{ color: '#0071E3', fontWeight: 600 }}>3. ATSEvaluator</span> →
              <span style={{ color: '#0071E3', fontWeight: 600 }}>4. HumanCopyWriter</span> →
              <span style={{ color: '#10B981', fontWeight: 700 }}>5. TruthfulnessCritic (100% Grounded)</span>
            </div>

            {/* Two column breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginTop: 20 }}>
              {/* Left: Keywords & Search Deep Links */}
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-foreground)', marginBottom: 8 }}>
                  VERIFIED SKILLS & KEYWORDS
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {role.skills.map((s, idx) => (
                    <span key={idx} style={{ background: '#DCFCE7', color: '#166534', padding: '4px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600 }}>
                      ✓ {s}
                    </span>
                  ))}
                  {role.missing.map((s, idx) => (
                    <span key={idx} style={{ background: '#FEE2E2', color: '#991b1b', padding: '4px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600 }}>
                      + {s}
                    </span>
                  ))}
                </div>

                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-foreground)', marginBottom: 8 }}>
                  1-CLICK CURATED BOARD SEARCH QUERY
                </div>
                <div style={{ background: 'var(--color-muted)', padding: '10px 14px', borderRadius: 10, fontSize: '0.82rem', color: 'var(--color-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.searchQuery}</code>
                  <CompassIcon size={16} color="#0071E3" style={{ flexShrink: 0, marginLeft: 8 }} />
                </div>
              </div>

              {/* Right: Truth-Grounded Letter */}
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-foreground)', marginBottom: 8 }}>
                  GROUNDED COVER LETTER (HUMAN VOICE)
                </div>
                <div style={{ background: 'var(--color-muted)', padding: '16px', borderRadius: 12, fontSize: '0.86rem', lineHeight: 1.55, color: 'var(--color-foreground)', fontStyle: 'italic', marginBottom: 10 }}>
                  "{role.sampleLetter}"
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#10B981', fontWeight: 600 }}>
                  <CheckCircleIcon size={14} /> Verified in resume: {role.verifiedChunk}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Apple-Grade Comparison ── */}
      <section className="landing-section" id="comparison">
        <p className="section-eyebrow">The Difference</p>
        <h2 className="section-title">Why other AI gets your resume rejected</h2>
        <p className="section-sub">Recruiters are exhausted by robotic, buzzword-heavy ChatGPT letters. Here is why Vitralume stands out:</p>

        <div className="autopsy-wrapper">
          {/* Card 1: The ChatGPT Trap */}
          <div className="autopsy-sheet bad">
            <div className="autopsy-header">
              <span className="autopsy-title">Generic AI Chatbots</span>
              <span className="stamp-rejected">Rejected in 5s</span>
            </div>
            <ul className="autopsy-list">
              <li className="autopsy-item">
                <span className="autopsy-icon-bad">✕</span>
                <div>
                  <b>Robotic Cliche Fluff:</b> Writes cringe phrases like <i>"I am deeply thrilled to leverage my synergies to spearhead paradigms."</i> Hiring managers delete these immediately.
                </div>
              </li>
              <li className="autopsy-item">
                <span className="autopsy-icon-bad">✕</span>
                <div>
                  <b>Hallucinated Stories:</b> Invents skills or claims you led teams you never worked on. When asked in an interview, you panic.
                </div>
              </li>
              <li className="autopsy-item">
                <span className="autopsy-icon-bad">✕</span>
                <div>
                  <b>Misses the ATS Filter:</b> Fails to match exact technical terminology from the company's job post.
                </div>
              </li>
            </ul>
          </div>

          {/* Card 2: Vitralume Way */}
          <div className="autopsy-sheet good">
            <div className="autopsy-header">
              <span className="autopsy-title">Vitralume Multi-Agent Copilot</span>
              <span className="stamp-approved">Interview Ready</span>
            </div>
            <ul className="autopsy-list">
              <li className="autopsy-item">
                <span className="autopsy-icon-good">✓</span>
                <div>
                  <b>Natural Human Voice:</b> Writes clean, confident, conversational English that hiring managers actually enjoy reading.
                </div>
              </li>
              <li className="autopsy-item">
                <span className="autopsy-icon-good">✓</span>
                <div>
                  <b>Truth-Grounded with RAG:</b> Every sentence cites real facts from your verified experience chunks. Zero fabricated stories.
                </div>
              </li>
              <li className="autopsy-item">
                <span className="autopsy-icon-good">✓</span>
                <div>
                  <b>ATS Filter Mastery:</b> Analyzes the job description and highlights the exact keywords to include from your background.
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Feature Bento Grid (Apple Style) ── */}
      <section className="landing-section" id="features">
        <p className="section-eyebrow">Everything You Need</p>
        <h2 className="section-title">Built like a professional career copilot</h2>
        <p className="section-sub">Four powerful tools engineered to give you an unfair advantage in your job hunt.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginTop: 40, textAlign: 'left' }}>
          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '28px 24px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(0, 113, 227, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <ShieldCheckIcon size={22} color="#0071E3" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-foreground)' }}>Truth-Grounded RAG</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-muted-foreground)', lineHeight: 1.5 }}>
              Your resume is indexed into vector embeddings. The agent is mathematically constrained to only cite real projects and achievements.
            </p>
          </div>

          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '28px 24px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16, 185, 129, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <BotIcon size={22} color="#10B981" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-foreground)' }}>LangGraph Multi-Agent</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-muted-foreground)', lineHeight: 1.5 }}>
              Five specialized agents extract requirements, retrieve proof, evaluate keyword overlap, draft human copy, and audit truthfulness.
            </p>
          </div>

          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '28px 24px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245, 158, 11, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <CompassIcon size={22} color="#F59E0B" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-foreground)' }}>Curated Board Directory</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-muted-foreground)', lineHeight: 1.5 }}>
              1-click pre-filled searches across LinkedIn, Indeed, Wellfound, RemoteOK, and Google Jobs using your resume's high-demand keywords.
            </p>
          </div>

          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '28px 24px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(139, 92, 246, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <FileTextIcon size={22} color="#8B5CF6" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-foreground)' }}>Zero-Fluff Export</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-muted-foreground)', lineHeight: 1.5 }}>
              Download interview-ready letters in Word (.docx), PDF, or clean text with no corporate clichés or robot giveaway phrases.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3 Simple Steps ── */}
      <section className="landing-section" id="how-it-works">
        <p className="section-eyebrow">Quick & Effortless</p>
        <h2 className="section-title">Ready in under two minutes</h2>
        <p className="section-sub">No complex setups or endless forms. Three intuitive steps:</p>

        <div className="story-steps">
          <div className="story-step">
            <div className="story-step-num">1</div>
            <div className="story-step-content">
              <h4>Drop in your resume</h4>
              <p>Upload your PDF or paste your experience. We chunk and index your skills and accomplishments into your private encrypted vault.</p>
            </div>
          </div>

          <div className="story-step">
            <div className="story-step-num">2</div>
            <div className="story-step-content">
              <h4>Paste any job posting or link</h4>
              <p>Found an opening on LinkedIn, Indeed, or a company portal? Paste the link or text, and our agents extract the requirements.</p>
            </div>
          </div>

          <div className="story-step">
            <div className="story-step-num">3</div>
            <div className="story-step-content">
              <h4>Review your truth-grounded letter</h4>
              <p>Check your ATS match score, verify cited facts, and export your application directly to Word, PDF, or text.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy & Security ── */}
      <section className="landing-section" id="privacy">
        <div style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          padding: '32px 36px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          maxWidth: 820,
          margin: '0 auto',
          textAlign: 'left',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'rgba(0, 113, 227, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LockIcon size={24} color="#0071E3" />
          </div>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-foreground)' }}>Your privacy is absolute</h3>
            <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--color-muted-foreground)', lineHeight: 1.5 }}>
              Your resume is stored privately in encrypted PostgreSQL. We never sell your data, never spam you, and never use your documents to train public AI models.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="landing-section" id="faq">
        <p className="section-eyebrow">Questions & Answers</p>
        <h2 className="section-title">Everything you need to know</h2>

        <div className="faq-list">
          {[
            [
              'How is Vitralume different from ChatGPT?',
              'ChatGPT generates generic, flowery text and often hallucinates fake experiences you never had. Vitralume uses a 5-agent LangGraph pipeline layered on top of vector RAG to mathematically ground every single claim in your real resume chunks.',
            ],
            [
              'Is Vitralume really free to use?',
              'Yes! You get free analyses and cover letters right away. For unlimited use, you can connect your own free Google Gemini API key and use Vitralume forever without paying a dime.',
            ],
            [
              'Can I install it on my phone or computer?',
              'Yes! Vitralume is an installable PWA. Open it on your phone (Safari or Chrome) or desktop and tap "Add to Home Screen" to use it as a native standalone app.',
            ],
            [
              'What export formats do you support?',
              'You can download your finished cover letter as Microsoft Word (.docx), PDF, clean text (.txt), or LaTeX if you are applying for academic roles.',
            ],
          ].map(([q, a], idx) => {
            const isOpen = openFaq === idx
            return (
              <div key={q} className="faq-item">
                <button className="faq-question" onClick={() => setOpenFaq(isOpen ? null : idx)}>
                  <span>{q}</span>
                  {isOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
                </button>
                {isOpen && <div className="faq-answer">{a}</div>}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Apple-Style Banner CTA ── */}
      <section style={{ padding: '80px 24px', textAlign: 'center', background: 'radial-gradient(circle at 50% 50%, rgba(0, 113, 227, 0.08) 0%, transparent 70%)' }}>
        <h2 style={{ fontSize: '2.4rem', fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.025em', color: 'var(--color-foreground)' }}>
          Ready to land more interviews?
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--color-muted-foreground)', maxWidth: 460, margin: '0 auto 28px' }}>
          Takes 30 seconds to start. No credit card required.
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => setView('auth')} style={{ borderRadius: 9999, padding: '14px 34px', fontSize: '1rem' }}>
          Start Free Today <ArrowRightIcon size={16} />
        </button>
      </section>

      {/* ── Apple-Style Clean Footer ── */}
      <footer className="landing-footer">
        <div className="landing-logo">
          <span className="logo-dot" />
          Vitralume
        </div>
        <p style={{ margin: '8px 0 4px', fontSize: '0.88rem', color: 'var(--color-muted-foreground)' }}>
          The honest, truth-grounded job application copilot.
        </p>
        <p className="footer-copy">© {new Date().getFullYear()} Vitralume · All rights reserved.</p>
      </footer>

      <InstallPrompt />
    </div>
  )
}

function scrollToId(id?: string) {
  document.getElementById(id ?? 'demo')?.scrollIntoView({ behavior: 'smooth' })
}
