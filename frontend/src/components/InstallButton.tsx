import { useEffect, useState } from 'react'
import { DownloadIcon, CheckCircle2Icon, MonitorIcon } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallButtonProps {
  compact?: boolean
}

/**
 * PWA Install Action with native prompt handling and browser instructions fallback.
 * Guarantees a visible, clickable button on all platforms.
 */
export function InstallButton({ compact = false }: InstallButtonProps = {}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    // Detect standalone PWA mode (window display-mode or iOS navigator.standalone)
    const checkStandalone = () => {
      const standaloneQuery = window.matchMedia?.('(display-mode: standalone)').matches
      const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
      setIsStandalone(Boolean(standaloneQuery || iosStandalone))
    }
    checkStandalone()

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferred(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') {
        setDeferred(null)
        setIsStandalone(true)
      }
    } else {
      setShowGuide((prev) => !prev)
    }
  }

  if (isStandalone) {
    if (compact) return null
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-primary-soft, rgba(35,134,54,0.12))',
          border: '1px solid var(--color-primary)',
          color: 'var(--color-primary)',
          fontSize: '0.82rem',
          fontWeight: 600,
        }}
      >
        <CheckCircle2Icon size={14} />
        Vitralume is installed & running as standalone app
      </div>
    )
  }

  if (compact) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-bubble install-btn-compact"
        onClick={handleInstallClick}
        title="Install Vitralume for one-tap launch and offline support"
        aria-label="Install Vitralume App"
      >
        <DownloadIcon size={14} />
        <span className="install-text-desktop">Install App</span>
        <span className="install-text-mobile">Install</span>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      <button
        type="button"
        className="btn btn-primary btn-bubble"
        onClick={handleInstallClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 18px',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.86rem',
          fontWeight: 650,
          cursor: 'pointer',
        }}
        title="Install Vitralume for one-tap launch and offline support"
      >
        <DownloadIcon size={15} />
        {deferred ? 'Install Vitralume App' : 'Install App to Desktop / Mobile'}
      </button>

      {showGuide && !deferred && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-muted)',
            border: '1px solid var(--color-border)',
            fontSize: '0.8rem',
            color: 'var(--color-foreground)',
            maxWidth: 520,
            lineHeight: 1.5,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, color: 'var(--color-primary)', marginBottom: 6 }}>
            <MonitorIcon size={14} />
            Quick Install Guide:
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            • In <strong>Brave / Chrome / Edge</strong>: Click the <strong>Install</strong> icon on the right side of the URL address bar, or open Menu (⋮) → <strong>Install Vitralume</strong>.<br />
            • On <strong>iOS / Safari</strong>: Tap the <strong>Share</strong> button (⎙) → select <strong>Add to Home Screen</strong>.<br />
            • On <strong>Android</strong>: Tap Menu (⋮) → select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </div>
        </div>
      )}
    </div>
  )
}
