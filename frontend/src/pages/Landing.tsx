import { useState } from 'react'
import {
  SparklesIcon, TargetIcon, BookOpenIcon, FileTextIcon,
  WandIcon, ShieldCheckIcon, BarChartIcon, CheckCircleIcon,
  ArrowRightIcon, CpuIcon,
} from 'lucide-react'
import { AuthPanel } from '../lib/auth'
import { InstallPrompt } from '../components/InstallPrompt'

/**
 * Public landing page shown to signed-out visitors.
 * Two internal views: the marketing page (`home`) and the auth card (`auth`).
 */
export default function LandingPage() {
  const [view, setView] = useState<'home' | 'auth'>('home')

  if (view === 'auth') {
    return (
      <div className="auth-screen">
        <AuthPanel onBack={() => setView('home')} />
      </div>
    )
  }

  return (
    <div className="landing fade-in">
      {/* ── Nav ── */}
      <header className="landing-nav">
        <a className="landing-logo" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <span className="logo-dot" />
          Vitralume
        </a>
        <nav className="landing-nav-links">
          <a href="#features" onClick={e => { e.preventDefault(); scrollToId('features') }}>Features</a>
          <a href="#how" onClick={e => { e.preventDefault(); scrollToId('how') }}>How it works</a>
          <a href="#privacy" onClick={e => { e.preventDefault(); scrollToId('privacy') }}>Privacy</a>
        </nav>
        <div className="landing-nav-actions">
          <button className="btn btn-ghost" onClick={() => setView('auth')}>Sign in</button>
          <button className="btn btn-primary" onClick={() => setView('auth')}>
            Get started <ArrowRightIcon size={14} />
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="hero-badge">
          <SparklesIcon size={13} />
          AI-powered job application copilot
        </div>
        <h1 className="hero-title">
          Land the role your research<br />
          <span className="grad-text">actually deserves.</span>
        </h1>
        <p className="hero-sub">
          Upload your resume, paste a job posting, and let AI score your fit,
          optimize your ATS keywords, match your publications, and draft a
          cover letter that stays truthful — every sentence audited.
        </p>
        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" onClick={() => setView('auth')}>
            Start free <ArrowRightIcon size={16} />
          </button>
          <button className="btn btn-secondary btn-lg" onClick={() => scrollToId('how')}>
            See how it works
          </button>
        </div>
        <div className="hero-stats">
          {[
            ['Fit score', '0–100%', 'per job'],
            ['ATS keywords', 'found & missing', 'auto-scanned'],
            ['Cover letters', 'every sentence', 'audited & cited'],
          ].map(([k, v, s]) => (
            <div key={k} className="stat-chip">
              <div className="stat-chip-value">{v}</div>
              <div className="stat-chip-label">{k} · {s}</div>
            </div>
          ))}
        </div>

        {/* Faux app preview */}
        <div className="hero-preview" aria-hidden="true">
          <div className="preview-window">
            <div className="preview-topbar">
              <span className="preview-dot" style={{ background: '#f87171' }} />
              <span className="preview-dot" style={{ background: '#fbbf24' }} />
              <span className="preview-dot" style={{ background: '#34d399' }} />
            </div>
            <div className="preview-body">
              <div className="preview-left">
                {[
                  ['NextGen Robotics Lab', 'Computer Vision Researcher', 92, 'high'],
                  ['MIT Media Lab', 'PhD Fellow — HCI', 84, 'high'],
                  ['Bosch Research', 'ML Engineer', 71, 'medium'],
                ].map(([company, role, score, cls]) => (
                  <div key={company as string} className="preview-app">
                    <div className="preview-logo">{(company as string)[0]}</div>
                    <div className="preview-info">
                      <div className="preview-company">{company}</div>
                      <div className="preview-role">{role}</div>
                    </div>
                    <div className={`score-mini ${cls}`}>{score}</div>
                  </div>
                ))}
              </div>
              <div className="preview-right">
                <div className="preview-ring">
                  <div className="preview-ring-value">92</div>
                  <div className="preview-ring-label">match</div>
                </div>
                <div className="preview-bars">
                  {[['Technical', 95], ['Research', 88], ['Leadership', 76], ['Communication', 90]].map(([l, v]) => (
                    <div key={l as string} className="preview-bar-row">
                      <span>{l}</span>
                      <div className="preview-bar">
                        <div className="preview-bar-fill" style={{ width: `${v}%` }} />
                      </div>
                      <b>{v}%</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-section" id="features">
        <p className="section-eyebrow">Everything you need</p>
        <h2 className="section-title">One workspace, every step of the application</h2>
        <p className="section-sub">From the first scan to the final export — built for researchers and engineers who apply to competitive roles.</p>
        <div className="feature-grid">
          {FEATURES.map(([Icon, title, desc]) => (
            <div key={title} className="feature-card">
              <div className="feature-icon"><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="landing-section" id="how">
        <p className="section-eyebrow">How it works</p>
        <h2 className="section-title">Live in three steps</h2>
        <div className="steps">
          {[
            [1, 'Upload your resume', 'Drop a PDF or paste plain text. AI extracts your skills, projects, publications, and career goals into an editable profile.'],
            [2, 'Add the jobs you want', 'Paste a posting manually or use Smart Paste — AI fills company, position, location, and a clean description.'],
            [3, 'Let AI do the heavy lifting', 'Analyze fit, fix ATS gaps, match research, and generate a truthful cover letter — then export and apply.'],
          ].map(([n, title, desc]) => (
            <div key={n} className="step-card">
              <div className="step-num">{n}</div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Privacy band ── */}
      <section className="landing-section" id="privacy">
        <div className="privacy-band">
          <div className="privacy-icon"><ShieldCheckIcon size={26} /></div>
          <div>
            <h3>Your data stays yours</h3>
            <p>Resumes and API keys are encrypted and stored per-account. Keys are write-only — they are never shown back to you or anyone else, and cover letters are verified against your real profile so nothing is invented.</p>
          </div>
          <div className="privacy-points">
            {PRIVACY_POINTS.map(([I, t]) => (
              <div key={t} className="privacy-point"><I size={14} />{t}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-band">
        <h2 className="cta-title">Your next offer is a <span className="grad-text">better application</span> away.</h2>
        <p className="cta-sub">Free to start. Bring your own AI provider key — Google Gemini, NVIDIA NIM, or a local Ollama.</p>
        <button className="btn btn-primary btn-lg" onClick={() => setView('auth')}>
          <CpuIcon size={16} /> Get started — it's free
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-logo">
          <span className="logo-dot" />
          Vitralume
        </div>
        <p>Built for researchers who don't have time to chase ATS keyword lists.</p>
        <p className="footer-copy">© {new Date().getFullYear()} Vitralume · Job Application Copilot</p>
      </footer>

      <InstallPrompt />
    </div>
  )
}

function scrollToId(id?: string) {
  document.getElementById(id ?? 'how')?.scrollIntoView({ behavior: 'smooth' })
}

const FEATURES: [typeof TargetIcon, string, string][] = [
  [TargetIcon, 'ATS Score & Keywords', 'See exactly which keywords from the job description appear in your resume — and which to add before you apply.'],
  [BarChartIcon, 'Suitability Analysis', 'A 0–100 fit score broken into technical, research, leadership, and communication dimensions with strengths and gaps.'],
  [BookOpenIcon, 'Research Matcher', 'Aligns your publications and projects with the lab or team, surfacing overlap with the professor\u2019s actual work.'],
  [FileTextIcon, 'Cover Letter Generator', 'Paragraph-level planning, five writing styles, and export to TXT, DOCX, or LaTeX in one click.'],
  [ShieldCheckIcon, 'Truthfulness Audit', 'Every sentence is checked against your real profile — a citation trail shows exactly what came from where.'],
  [WandIcon, 'Smart Job Paste', 'Paste any job posting — LinkedIn, email, university site — and AI extracts the fields automatically.'],
]

const PRIVACY_POINTS: [typeof CheckCircleIcon, string][] = [
  [CheckCircleIcon, 'Encrypted at rest'],
  [CheckCircleIcon, 'Per-account isolation'],
  [CheckCircleIcon, 'Audited AI output'],
]
