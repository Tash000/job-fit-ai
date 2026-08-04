import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client. Configured via Vite env vars:
 *   VITE_SUPABASE_URL      (public)
 *   VITE_SUPABASE_ANON_KEY (public anon key)
 *
 * When unset, the app runs in DEMO mode (no login required) — the backend
 * mirrors this with its own demo mode. Never put secrets here.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

export const isSupabaseConfigured = supabase !== null
