import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
export type Accent = 'blue' | 'purple'

const THEME_KEY = 'vitralume-theme'
const ACCENT_KEY = 'vitralume-accent'

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function parseTheme(v: string | null): Theme | null {
  return v === 'light' || v === 'dark' || v === 'system' ? v : null
}

function parseAccent(v: string | null): Accent | null {
  return v === 'blue' || v === 'purple' ? v : null
}

function getInitialTheme(): Theme {
  try {
    // ?theme=light|dark|system in the URL overrides the saved/system preference.
    return (
      parseTheme(new URLSearchParams(window.location.search).get('theme'))
      ?? parseTheme(localStorage.getItem(THEME_KEY))
      ?? 'system'
    )
  } catch {
    return 'system'
  }
}

function getInitialAccent(): Accent {
  try {
    // ?accent=blue|purple in the URL overrides the saved preference.
    return (
      parseAccent(new URLSearchParams(window.location.search).get('accent'))
      ?? parseAccent(localStorage.getItem(ACCENT_KEY))
      ?? 'blue'
    )
  } catch {
    return 'blue'
  }
}

export interface Appearance {
  /** The user's preference ('system' follows the OS). */
  theme: Theme
  /** The brand accent color. */
  accent: Accent
  /** The theme actually applied right now. */
  resolved: ResolvedTheme
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
  toggleTheme: () => void
}

/**
 * Theme + accent preference with pre-paint-safe persistence.
 * Writes `data-theme` and `data-accent` onto <html> so the CSS token
 * system (semantic layer) can switch without JS class logic.
 */
export function useAppearance(): Appearance {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [accent, setAccent] = useState<Accent>(getInitialAccent)
  const [sysDark, setSysDark] = useState<boolean>(systemPrefersDark)

  // Follow OS changes only while the user is on 'system'.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const resolved: ResolvedTheme = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = resolved
    el.dataset.accent = accent
    try {
      localStorage.setItem(THEME_KEY, theme)
      localStorage.setItem(ACCENT_KEY, accent)
      // Keep the browser chrome (e.g. mobile address bar) in sync.
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#f6f7f9')
    } catch {
      /* ignore storage errors (private mode etc.) */
    }
  }, [resolved, accent, theme])

  const toggleTheme = useCallback(() => {
    // Resolve 'system' first so the toggle always flips what the user sees.
    setTheme(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved])

  return { theme, accent, resolved, setTheme, setAccent, toggleTheme }
}
