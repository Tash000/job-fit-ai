/**
 * Per-user cache of the public settings payload.
 *
 * The settings endpoint can be slow on first load (cold backend), so we paint
 * the app shell from the last-known-good value and refresh in the background.
 * The cache is keyed by user id so one account can never see another's flags.
 * Only non-secret data is cached (keys are write-only masked previews).
 */
import type { Settings } from './types'

function cacheKey(userId: string) {
  return `vitralume:settings:${userId}`
}

export function loadCachedSettings(userId: string): Settings | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Settings
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function saveCachedSettings(userId: string, settings: Settings) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(settings))
  } catch {
    /* storage unavailable — ignore */
  }
}
