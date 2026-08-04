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
