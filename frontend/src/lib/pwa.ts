import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// The `beforeinstallprompt` event fires only once, very early. Keep the
// deferred prompt at module level so any mounted component (landing page or
// app shell) can pick it up — remounts must not miss it.
let deferred: BeforeInstallPromptEvent | null = null
let initialized = false

const listeners = new Set<() => void>()
function notify() { listeners.forEach(fn => fn()) }
function setDeferred(p: BeforeInstallPromptEvent | null) {
  deferred = p
  notify()
}
function init() {
  if (initialized) return
  initialized = true
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    setDeferred(e as BeforeInstallPromptEvent)
  })
  window.addEventListener('appinstalled', () => setDeferred(null))
}

/** True while the browser is offering a PWA install for this app. */
export function usePWAInstall() {
  const [, setTick] = useState(0)

  useEffect(() => {
    init()
    const force = () => setTick(t => t + 1)
    listeners.add(force)
    return () => { listeners.delete(force) }
  }, [])

  const install = async () => {
    const p = deferred
    if (!p) return
    await p.prompt()
    await p.userChoice
    setDeferred(null)
  }

  return {
    installable: deferred !== null,
    install,
  }
}
