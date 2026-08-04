import { getAuthToken } from './token'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

/** Base for all backend calls (same-origin in dev / self-host; VITE_API_BASE in prod). */
export { API_BASE }

/**
 * Installs a fetch wrapper that:
 *  - attaches `Authorization: Bearer <jwt>` to same-origin and API requests
 *  - dispatches `vitralume:auth-expired` on 401 so the UI can log the user out
 *
 * Called once from main.tsx before the app renders. Existing call sites in the
 * app keep using plain `fetch` unchanged.
 */
export function installFetchInterceptor() {
  if (typeof window === 'undefined') return
  const originalFetch = window.fetch

  window.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    const isApiCall = rawUrl.startsWith('/api') || (API_BASE && rawUrl.startsWith(API_BASE))

    if (!isApiCall) {
      return originalFetch(input, init)
    }

    const token = getAuthToken()
    if (token) {
      // Merge headers safely (handles both plain objects and Headers instances).
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${token}`)
      init = { ...init, headers }
    }

    const response = await originalFetch(input, init)
    if (response.status === 401 && token) {
      window.dispatchEvent(new CustomEvent('vitralume:auth-expired'))
    }
    return response
  }
}
