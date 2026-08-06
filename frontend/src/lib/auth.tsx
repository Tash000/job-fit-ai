import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LockIcon, MailIcon, ShieldCheckIcon } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './supabase'
import { setCachedToken } from './token'

// ── Context ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
}

interface AuthResult {
  error?: string
  confirmation?: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  demo: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const demo = !isSupabaseConfigured

  useEffect(() => {
    if (!supabase) {
      setCachedToken(null)
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCachedToken(data.session?.access_token ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setCachedToken(s?.access_token ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    if (!supabase) return { error: 'Authentication is not configured on this deployment.' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { error: error.message } : {}
  }

  async function signUp(email: string, password: string) {
    if (!supabase) return { error: 'Authentication is not configured on this deployment.' }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message }
    // With email confirmation enabled, no session is returned until the user
    // confirms — surface that instead of silently doing nothing.
    if (!data.session) return { confirmation: true }
    return {}
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  const user: AuthUser | null = demo
    ? { id: 'demo-user', email: 'demo · local mode' }
    : session?.user
      ? { id: session.user.id, email: session.user.email ?? 'unknown' }
      : null

  return (
    <AuthContext.Provider value={{ user, demo, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components — hooks may share a file with providers
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// ── Auth panel ────────────────────────────────────────────────────────────────
// Reusable sign-in / sign-up card. Used by the landing page and the legacy
// standalone login screen.

export function AuthPanel({ onBack }: { onBack?: () => void }) {
  const { signIn, signUp, demo } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (demo) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || password.length < 6) {
      setError('Enter a valid email and a password of at least 6 characters.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    const res = mode === 'signin' ? await signIn(email.trim(), password) : await signUp(email.trim(), password)
    setBusy(false)
    if (res.confirmation) {
      setNotice('Account created — check your email to confirm, then sign in.')
      setMode('signin')
      return
    }
    if (res.error) {
      setError(res.error)
      if (mode === 'signup') setMode('signin')
    }
  }

  return (
    <form className="auth-card fade-in" onSubmit={submit}>
      {onBack && (
        <button type="button" className="btn btn-ghost btn-sm auth-back" onClick={onBack}>
          ← Back to home
        </button>
      )}
      <div className="auth-brand">
        <span className="logo-dot" />
        <h1>Vitralume</h1>
        <p className="text-sm text-secondary">Glass-clear insight into your job fit</p>
      </div>

      <label className="form-label" htmlFor="auth-email">Email</label>
      <div className="auth-field">
        <MailIcon size={15} className="auth-field-icon" />
        <input
          id="auth-email"
          className="form-input"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>

      <label className="form-label" htmlFor="auth-password">Password</label>
      <div className="auth-field">
        <LockIcon size={15} className="auth-field-icon" />
        <input
          id="auth-password"
          className="form-input"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </div>

      {error && <div className="auth-error text-sm">{error}</div>}
      {notice && <div className="auth-notice text-sm">{notice}</div>}

      <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
        {busy ? <><div className="spinner" />Please wait…</> : mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ width: '100%' }}
        onClick={() => { setMode(m => (m === 'signin' ? 'signup' : 'signin')); setError(null) }}
      >
        {mode === 'signin' ? 'No account? Create one' : 'Already registered? Sign in'}
      </button>

      <p className="auth-note text-xs text-muted">
        <ShieldCheckIcon size={12} style={{ display: 'inline', marginRight: 4 }} />
        Your data is encrypted and private to your account.
      </p>
    </form>
  )
}


