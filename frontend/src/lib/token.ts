/**
 * Synchronous access-token cache.
 *
 * The auth context updates this whenever the Supabase session changes; the
 * fetch interceptor (lib/api.ts) reads it on every request. Kept outside of
 * React so it can be read without hooks.
 */
let cachedToken: string | null = null

export function setCachedToken(token: string | null) {
  cachedToken = token
}

export function getAuthToken(): string | null {
  return cachedToken
}

// ── Inactivity-based session expiry ──────────────────────────────────────────
//
// A persisted "last activity" timestamp powers two behaviors:
//  1. Boot: if the stored session is older than SESSION_IDLE_MS, we sign out
//     before restoring it — so returning after a long time lands on the
//     landing page instead of jumping straight into the app.
//  2. Watchdog: an open idle tab signs out after SESSION_IDLE_MS without
//     activity, showing the sign-in page again.

export const SESSION_IDLE_MS = 60 * 60 * 1000 // 1 hour

const LAST_ACTIVE_KEY = 'vitralume:last-active'

export function touchLastActive() {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
  } catch {
    /* storage unavailable — ignore */
  }
}

export function getLastActive(): number {
  try {
    return Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? 0) || 0
  } catch {
    return 0
  }
}

export function clearLastActive() {
  try {
    localStorage.removeItem(LAST_ACTIVE_KEY)
  } catch {
    /* ignore */
  }
}
