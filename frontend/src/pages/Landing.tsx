import { useState } from 'react'
import {
  FileTextIcon, CheckCircleIcon,
  ArrowRightIcon, SparklesIcon, SearchIcon,
  ChevronDownIcon, ChevronUpIcon,
  LockIcon, GraduationCapIcon
} from 'lucide-react'
import { AuthPanel } from '../lib/auth'
import { InstallPrompt } from '../components/InstallPrompt'

/**
 * Public landing page.
 * Warm, human, friendly, and honest.
 * No robotic buzzwords, no C2-level jargon, no boring grid of 6 boxes.
 */
export default function LandingPage() {
  const [view, setView] = useState<'home' | 'auth'>('home')
  const [activeTab, setActiveTab] = useState<'ats' | 'letter' | 'research'>('ats')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

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
          <a href="#comparison" onClick={e => { e.preventDefault(); scrollToId('comparison') }}>The Difference</a>
          <a href="#how-it-helps" onClick={e => { e.preventDefault(); scrollToId('how-it-helps') }}>What It Does</a>
          <a href="#how-it-works" onClick={e => { e.preventDefault(); scrollToId('how-it-works') }}>How It Works</a>
          <a href="#faq" onClick={e => { e.preventDefault(); scrollToId('faq') }}>FAQ</a>
        </nav>
        <div className="landing-nav-actions">
          <button className="btn btn-ghost" onClick={() => setView('auth')}>Sign in</button>
          <button className="btn btn-primary" onClick={() => setView('auth')}>
            Try It Free <ArrowRightIcon size={14} />
          </button>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="landing-hero">
        <div className="hero-badge">
          <SparklesIcon size={13} />
          Built for real job seekers · Not robots
        </div>

        <h1 className="hero-title">
          Stop sending your resume<br />
          into a black hole.
        </h1>

        <p className="hero-sub">
          Most companies use computer filters that throw out your resume in 6 seconds.
          Vitralume shows you what the filter is looking for, helps you fix what's missing,
          and writes a cover letter from your real experience — without inventing fake stories.
        </p>

        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" onClick={() => setView('auth')}>
            Fix My Application — It's Free <ArrowRightIcon size={16} />
          </button>
          <button className="btn btn-secondary btn-lg" onClick={() => scrollToId('comparison')}>
            See The Difference ↓
          </button>
        </div>

        {/* ── The Two Applications: Real-World Comparison ── */}
        <div className="autopsy-wrapper" id="comparison">
          {/* Card 1: The Painful Reality */}
          <div className="autopsy-sheet bad">
            <div className="autopsy-header">
              <span className="autopsy-title">Applying Without Vitralume</span>
              <span className="stamp-rejected">Rejected in 5s</span>
            </div>
            <ul className="autopsy-list">
              <li className="autopsy-item">
                <span className="autopsy-icon-bad">✕</span>
                <div>
                  <b>Filter threw it away:</b> You wrote "team player and quick learner", but the company filter wanted exact words like "Python" or "Docker".
                </div>
              </li>
              <li className="autopsy-item">
                <span className="autopsy-icon-bad">✕</span>
                <div>
                  <b>Generic ChatGPT letter:</b> You used a chatbot that wrote <i>"I am deeply thrilled and excited to express my passion"</i> — recruiters cringe at this.
                </div>
              </li>
              <li className="autopsy-item">
                <span className="autopsy-icon-bad">✕</span>
                <div>
                  <b>Fake AI hallucinations:</b> The AI made up that you led 30 people when you were an intern. Now you're sweating about the interview.
                </div>
              </li>
            </ul>
          </div>

          {/* Card 2: The Vitralume Way */}
          <div className="autopsy-sheet good">
            <div className="autopsy-header">
              <span className="autopsy-title">Applying With Vitralume</span>
              <span className="stamp-approved">Interview Ready</span>
            </div>
            <ul className="autopsy-list">
              <li className="autopsy-item">
                <span className="autopsy-icon-good">✓</span>
                <div>
                  <b>Beat the filter:</b> We scan the job post and list the exact missing keywords you forgot to include from your past work.
                </div>
              </li>
              <li className="autopsy-item">
                <span className="autopsy-icon-good">✓</span>
                <div>
                  <b>Sounds like a real human:</b> We ban robotic clichés. Your letter reads confident, honest, and directly answers what they need.
                </div>
              </li>
              <li className="autopsy-item">
                <span className="autopsy-icon-good">✓</span>
                <div>
                  <b>Truthfulness Guard:</b> Every sentence is checked against your real resume. Zero invented stories. You can explain every word with your head held high.
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Interactive Feature Folder (Not 6 boring boxes!) ── */}
      <section className="landing-section" id="how-it-helps">
        <p className="section-eyebrow">How It Helps You</p>
        <h2 className="section-title">Everything you need to apply with confidence</h2>
        <p className="section-sub">Click a tool below to see how it works in real life:</p>

        <div className="binder-container">
          <div className="binder-tabs">
            <button
              className={`binder-tab ${activeTab === 'ats' ? 'active' : ''}`}
              onClick={() => setActiveTab('ats')}
            >
              <SearchIcon size={16} /> 1. Keyword Scanner
            </button>
            <button
              className={`binder-tab ${activeTab === 'letter' ? 'active' : ''}`}
              onClick={() => setActiveTab('letter')}
            >
              <FileTextIcon size={16} /> 2. Honest Cover Letters
            </button>
            <button
              className={`binder-tab ${activeTab === 'research' ? 'active' : ''}`}
              onClick={() => setActiveTab('research')}
            >
              <GraduationCapIcon size={16} /> 3. Research & Lab Match
            </button>
          </div>

          <div className="binder-body">
            {activeTab === 'ats' && (
              <>
                <div className="binder-explainer">
                  <h3>Find out what the hiring computer wants</h3>
                  <p>
                    Hiring managers use software (called an ATS) to filter applicants before a human ever looks.
                    If the job asks for "SQL" and you only wrote "databases", you get filtered out.
                  </p>
                  <p>
                    Vitralume scans both documents and highlights the exact words you already know but forgot to mention on your resume.
                  </p>
                  <button className="btn btn-primary" onClick={() => setView('auth')}>
                    Scan My Resume Free →
                  </button>
                </div>
                <div className="binder-preview-box">
                  <div style={{ marginBottom: 8, fontWeight: 'bold' }}>Job says: "Must know PostgreSQL and Cloud Deployments"</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ color: '#236E45', background: 'rgba(35,110,69,0.1)', padding: '6px 10px', borderRadius: 3 }}>
                      ✓ <b>PostgreSQL:</b> Found 3 times on page 1 of your resume
                    </div>
                    <div style={{ color: '#C1272D', background: 'rgba(193,39,45,0.1)', padding: '6px 10px', borderRadius: 3 }}>
                      ⚠ <b>Cloud Deployments:</b> Missing! You worked with AWS on project #2 — add it here!
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'letter' && (
              <>
                <div className="binder-explainer">
                  <h3>Letters that sound human — and never lie</h3>
                  <p>
                    Normal AI writes flowery, fake letters full of exaggerations. When the interviewer asks
                    "Tell me about this project", you panic because you never actually did it.
                  </p>
                  <p>
                    Vitralume's <b>Truthfulness Guard</b> checks every sentence. It only writes about things you actually did,
                    phrased in clear, natural English that gets straight to the point.
                  </p>
                  <button className="btn btn-primary" onClick={() => setView('auth')}>
                    Draft a Truthful Letter →
                  </button>
                </div>
                <div className="binder-preview-box">
                  <div style={{ fontStyle: 'italic', marginBottom: 10, lineHeight: 1.4 }}>
                    "During my time at Acme Corp, I managed our customer database and helped speed up our reporting system by 35%..."
                  </div>
                  <div style={{ color: '#236E45', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircleIcon size={14} /> Verified from your resume: Acme Corp, 2023
                  </div>
                </div>
              </>
            )}

            {activeTab === 'research' && (
              <>
                <div className="binder-explainer">
                  <h3>Applying for grad school, a lab, or PhD?</h3>
                  <p>
                    Sending a generic email to a professor gets you deleted immediately. They want to know if you actually understand their work.
                  </p>
                  <p>
                    Vitralume reads the professor's recent publications and connects their research directly to your thesis, coursework, or lab experience.
                  </p>
                  <button className="btn btn-primary" onClick={() => setView('auth')}>
                    Match My Research →
                  </button>
                </div>
                <div className="binder-preview-box">
                  <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Professor's Lab Topic: "Computer Vision in Healthcare"</div>
                  <div style={{ color: '#236E45', background: 'rgba(35,110,69,0.1)', padding: '6px 10px', borderRadius: 3, fontSize: '0.8rem', lineHeight: 1.4 }}>
                    Found 82% overlap with your undergraduate project on MRI image segmentation!
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── How It Works (Simple 3 steps, flowing line, not boxes) ── */}
      <section className="landing-section" id="how-it-works">
        <p className="section-eyebrow">Quick & Easy</p>
        <h2 className="section-title">Ready in about two minutes</h2>
        <p className="section-sub">No long forms or complicated setups. Just three simple steps:</p>

        <div className="story-steps">
          <div className="story-step">
            <div className="story-step-num">1</div>
            <div className="story-step-content">
              <h4>Drop in your resume</h4>
              <p>Upload a PDF or just copy-paste the text. We read your real skills, past jobs, and education into your private profile.</p>
            </div>
          </div>

          <div className="story-step">
            <div className="story-step-num">2</div>
            <div className="story-step-content">
              <h4>Paste the job you want</h4>
              <p>Found a job on LinkedIn, Indeed, or a company site? Paste the text (or just the link), and we grab all the requirements.</p>
            </div>
          </div>

          <div className="story-step">
            <div className="story-step-num">3</div>
            <div className="story-step-content">
              <h4>Get your fixes & download</h4>
              <p>See your match score, add the missing keywords, grab your tailored cover letter, and download it in Word, PDF, or text.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy Note ── */}
      <section className="landing-section" id="privacy">
        <div className="privacy-band">
          <div className="privacy-icon"><LockIcon size={24} /></div>
          <div>
            <h3>Your resume stays your business</h3>
            <p>
              We don't sell your data, we don't spam you, and we don't train public AI models on your work.
              Your API keys and uploaded documents are encrypted with bank-level security.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="landing-section" id="faq">
        <p className="section-eyebrow">Common Questions</p>
        <h2 className="section-title">Everything you might wonder</h2>

        <div className="faq-list">
          {[
            [
              'Is Vitralume really free to use?',
              'Yes! You get free analyses and cover letters to try it out. If you want unlimited use, you can bring your own free Google Gemini API key (takes 30 seconds to get) and use it forever without paying us a penny.',
            ],
            [
              'Will this write lies on my application?',
              'Never. That is our #1 rule. Most AI tools invent fake projects and jobs. Vitralume only writes about things you actually did, so you can speak honestly and confidently in your interview.',
            ],
            [
              'Can I use it on my phone?',
              'Yes! Vitralume is an installable app (PWA). You can open it in Chrome or Safari on your phone and tap "Add to Home Screen" to use it just like a regular app.',
            ],
            [
              'What formats can I export to?',
              'You can download your cover letter as Word (.docx), PDF, clean text (.txt), or LaTeX if you are in academia.',
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

      {/* ── Final Warm CTA ── */}
      <section className="cta-band">
        <h2 className="cta-title">Ready to land more interviews?</h2>
        <p className="cta-sub">Takes 30 seconds to start. No credit card required.</p>
        <button className="btn btn-primary btn-lg" onClick={() => setView('auth')}>
          Start Free Today <ArrowRightIcon size={16} />
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-logo">
          <span className="logo-dot" />
          Vitralume
        </div>
        <p>The honest job application assistant.</p>
        <p className="footer-copy">© {new Date().getFullYear()} Vitralume · All rights reserved.</p>
      </footer>

      <InstallPrompt />
    </div>
  )
}

function scrollToId(id?: string) {
  document.getElementById(id ?? 'comparison')?.scrollIntoView({ behavior: 'smooth' })
}
