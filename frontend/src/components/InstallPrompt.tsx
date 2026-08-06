import { useEffect, useState } from 'react'
import { DownloadIcon, XIcon } from 'lucide-react'
import { usePWAInstall } from '../lib/pwa'

const DISMISS_KEY = 'vitralume-install-dismissed'

/**
 * Auto-appearing install prompt (bottom-right card on desktop, bottom
 * sheet above the nav on phones). Dismissal is remembered for the session.
 */
export function InstallPrompt() {
  const { installable, install } = usePWAInstall()
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  const [show, setShow] = useState(false)

  // Give the browser's own UI a moment before we pop ours in.
  useEffect(() => {
    if (!installable || dismissed) return
    const t = setTimeout(() => setShow(true), 1200)
    return () => clearTimeout(t)
  }, [installable, dismissed])

  const alreadyInstalled =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches

  if (!show || dismissed || alreadyInstalled || !installable) return null

  const dismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  return (
    <div className="install-prompt" role="dialog" aria-label="Install the Vitralume app">
      <div className="install-prompt-body">
        <div className="install-prompt-icon"><DownloadIcon size={20} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4>Install Vitralume</h4>
          <p>One-tap launch from your home screen, and it works offline.</p>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm install-close" onClick={dismiss} aria-label="Dismiss">
          <XIcon size={14} />
        </button>
      </div>
      <div className="install-prompt-actions">
        <button className="btn btn-ghost btn-sm" onClick={dismiss}>Not now</button>
        <button className="btn btn-primary btn-sm" onClick={() => void install()}>Install</button>
      </div>
    </div>
  )
}
