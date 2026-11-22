import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
export type Accent = 'blue' | 'purple'
export type Style = 'modern'

const THEME_KEY = 'vitralume-theme'
const ACCENT_KEY = 'vitralume-accent'
const STYLE_KEY = 'vitralume-style'
const OPTIONAL_KEY = 'vitralume-optional-themes'

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
  /** Modern Apple/Google clean design style. */
  style: Style
  /** Retained for backwards compatibility. */
  optionalThemes: boolean
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
  setStyle: (s: Style) => void
  setOptionalThemes: (on: boolean) => void
  toggleTheme: () => void
}

/** Modern canvas colors: crisp white/slate in light, obsidian/midnight in dark. */
const CANVAS: Record<ResolvedTheme, string> = {
  light: '#F8F9FB',
  dark: '#000000',
}

/**
 * Modern theme + accent controller.
 * Enforces Apple/Google clean aesthetic and purges legacy beige/paper states.
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
    el.dataset.style = 'modern'

    try {
      localStorage.setItem(THEME_KEY, theme)
      localStorage.setItem(ACCENT_KEY, accent)
      // Purge any legacy beige/editorial keys from user localStorage
      localStorage.removeItem(STYLE_KEY)
      localStorage.removeItem(OPTIONAL_KEY)

      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', CANVAS[resolved])
    } catch {
      /* ignore storage errors (private mode etc.) */
    }
  }, [resolved, accent, theme])

  const toggleTheme = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved])

  return {
    theme,
    accent,
    resolved,
    style: 'modern',
    optionalThemes: false,
    setTheme,
    setAccent,
    setStyle: () => {},
    setOptionalThemes: () => {},
    toggleTheme,
  }
}
