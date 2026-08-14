import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
export type Accent = 'blue' | 'purple'
/** Theme style: 'editorial' is the classic look; 'beige' and 'noir' are
 *  optional styles with their own designed light AND dark modes. */
export type Style = 'editorial' | 'beige' | 'noir'

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

function parseStyle(v: string | null): Style | null {
  return v === 'editorial' || v === 'beige' || v === 'noir' ? v : null
}

function parseOptional(v: string | null): boolean | null {
  if (v === '1' || v === 'true') return true
  if (v === '0' || v === 'false') return false
  return null
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

function getInitialStyle(): Style {
  try {
    // ?style=editorial|beige|noir in the URL overrides the saved preference.
    return (
      parseStyle(new URLSearchParams(window.location.search).get('style'))
      ?? parseStyle(localStorage.getItem(STYLE_KEY))
      ?? 'editorial'
    )
  } catch {
    return 'editorial'
  }
}

function getInitialOptionalThemes(): boolean {
  try {
    // ?style=beige|noir in the URL implies the optional themes are enabled
    // for that session (a deep link should render the requested style).
    const urlStyle = new URLSearchParams(window.location.search).get('style')
    if (urlStyle === 'beige' || urlStyle === 'noir') return true
    // Default OFF → the classic theme stays the only option until the user
    // explicitly turns the optional styles on in Settings.
    return parseOptional(localStorage.getItem(OPTIONAL_KEY)) ?? false
  } catch {
    return false
  }
}

export interface Appearance {
  /** The user's preference ('system' follows the OS). */
  theme: Theme
  /** The brand accent color (classic style only). */
  accent: Accent
  /** The theme actually applied right now. */
  resolved: ResolvedTheme
  /** Theme style — 'editorial' classic, or optional 'beige'/'noir'. */
  style: Style
  /** Whether the optional Beige/Noir styles are enabled at all. */
  optionalThemes: boolean
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
  setStyle: (s: Style) => void
  setOptionalThemes: (on: boolean) => void
  toggleTheme: () => void
}

/** Canvas color per style, used for the browser chrome (meta theme-color). */
const CANVAS: Record<Style, Record<ResolvedTheme, string>> = {
  editorial: { light: '#F3EEE4', dark: '#161310' },
  beige: { light: '#EDEDCE', dark: '#211C14' },
  noir: { light: '#EFE4D2', dark: '#131D4F' },
}

/**
 * Theme + accent + style preference with pre-paint-safe persistence.
 * Writes `data-theme`, `data-accent` and `data-style` onto <html> so the
 * CSS token system (semantic layer) can switch without JS class logic.
 */
export function useAppearance(): Appearance {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [accent, setAccent] = useState<Accent>(getInitialAccent)
  const [style, setStyle] = useState<Style>(getInitialStyle)
  const [optionalThemes, setOptionalThemes] = useState<boolean>(getInitialOptionalThemes)
  const [sysDark, setSysDark] = useState<boolean>(systemPrefersDark)

  // The style only takes effect when optional themes are enabled; otherwise
  // the app keeps the classic editorial look.
  const effectiveStyle: Style = optionalThemes ? style : 'editorial'

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
    el.dataset.style = effectiveStyle
    try {
      localStorage.setItem(THEME_KEY, theme)
      localStorage.setItem(ACCENT_KEY, accent)
      localStorage.setItem(STYLE_KEY, style)
      localStorage.setItem(OPTIONAL_KEY, optionalThemes ? '1' : '0')
      // Keep the browser chrome (e.g. mobile address bar) in sync.
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', CANVAS[effectiveStyle][resolved])
    } catch {
      /* ignore storage errors (private mode etc.) */
    }
  }, [resolved, accent, theme, style, optionalThemes, effectiveStyle])

  const toggleTheme = useCallback(() => {
    // Resolve 'system' first so the toggle always flips what the user sees.
    setTheme(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved])

  return { theme, accent, resolved, style, optionalThemes, setTheme, setAccent, setStyle, setOptionalThemes, toggleTheme }
}
