import {
  CpuIcon, KeyIcon, FileTextIcon, ZapIcon, SparklesIcon,
  XCircleIcon, CheckCircleIcon, ArrowRightIcon, ShieldCheckIcon, ExternalLinkIcon,
} from 'lucide-react'
import type { Settings } from '../lib/types'
import { isUsingFreeAllowance } from '../lib/types'

/**
 * Onboarding popup shown on every login until the account adds its OWN
 * provider API key. It doubles as the "getting started" tutorial: add a key →
 * upload your resume → analyze a job → generate a cover letter.
 */
export function SetupWizard({
  open, settings, onClose, onGoTo,
}: {
  open: boolean
  settings: Settings | null
  onClose: () => void
  onGoTo: (path: string) => void
}) {
  if (!open) return null

  const freeTier = isUsingFreeAllowance(settings)
  const fu = settings?.freeUsage

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card fade-in modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="card-header" style={{ padding: '18px 22px 0' }}>
          <SparklesIcon size={17} color="var(--accent-light)" />
          <span className="card-title">Welcome to Vitralume — let's set you up</span>
          <button className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <XCircleIcon size={16} />
          </button>
        </div>

        <div className="card-body flex flex-col gap-12" style={{ paddingTop: 14 }}>
          {/* Free tier explanation */}
          <div className="card" style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-border)' }}>
            <div className="card-body" style={{ padding: '12px 16px' }}>
              <div className="flex items-center gap-8">
                <ShieldCheckIcon size={15} color="var(--accent-light)" style={{ flexShrink: 0 }} />
                <p className="text-sm" style={{ margin: 0 }}>
                  <strong>Bring your own AI key.</strong>{' '}
                  {freeTier
                    ? <>New accounts get <strong>{fu?.analysesLimit ?? 2} free job analyses</strong> and{' '}
                      <strong>{fu?.lettersLimit ?? 1} free cover letter</strong> on the platform key. After that, add
                      your own Google Gemini API key to keep going — you'll never be billed here.</>
                    : <>Your account already has its own provider key — you're all set for unlimited use.</>}
                </p>
              </div>
            </div>
          </div>

          {/* Step-by-step guide */}
          <div className="flex flex-col gap-10">
            {[
              {
                icon: KeyIcon,
                title: '1. Add your Gemini API key',
                desc: 'Get a free key from Google AI Studio and paste it in Settings → AI Providers → Google Gemini. This powers every AI feature with your own quota.',
                action: () => onGoTo('/settings'),
                actionLabel: 'Open Settings',
                done: !!settings?.has_own_key,
              },
              {
                icon: FileTextIcon,
                title: '2. Upload your resume',
                desc: 'Drop your PDF (or paste the text) in Resume & Profile. AI extracts your skills, experience, and projects into your private profile.',
                action: () => onGoTo('/profile'),
                actionLabel: 'Upload resume',
              },
              {
                icon: ZapIcon,
                title: '3. Analyze a job',
                desc: 'Add a job from a URL or paste the posting, then click Analyze Job for a fit score, ATS keywords, and research match.',
                action: () => onGoTo('/applications'),
                actionLabel: 'Go to Applications',
              },
              {
                icon: CpuIcon,
                title: '4. Generate your cover letter',
                desc: 'Plan and generate a truthful, audited cover letter — then export it as TXT, PDF, DOCX, or LaTeX.',
              },
            ].map(({ icon: Icon, title, desc, action, actionLabel, done }, i) => (
              <div key={i} className="setup-step">
                <div className={`setup-step-icon ${done ? 'done' : ''}`}>
                  {done ? <CheckCircleIcon size={16} /> : <Icon size={16} />}
                </div>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="form-label" style={{ marginBottom: 2 }}>{title}</div>
                  <p className="text-xs text-muted" style={{ margin: 0 }}>{desc}</p>
                </div>
                {action && (
                  <button className="btn btn-secondary btn-sm" onClick={action} style={{ flexShrink: 0 }}>
                    {actionLabel} <ArrowRightIcon size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {!settings?.has_own_key && (
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              <ExternalLinkIcon size={11} style={{ display: 'inline', marginRight: 4 }} />
              Get a free Gemini key at{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent-light)' }}
              >
                aistudio.google.com/app/apikey
              </a>
              {' '}— no credit card required.
            </p>
          )}

          <div className="flex gap-8" style={{ marginTop: 4 }}>
            <button className="btn btn-primary flex-1" onClick={() => { onClose(); onGoTo('/settings') }}>
              <KeyIcon size={14} />Add my API key
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Maybe later</button>
          </div>
        </div>
      </div>
    </div>
  )
}
