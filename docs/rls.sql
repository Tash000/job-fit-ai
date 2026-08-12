-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security for Vitralume (Postgres/Supabase)
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor. The backend continues to enforce
-- user_id scoping in the application layer as well.
--
-- WHY THIS IS NOT OPTIONAL: these tables live in the `public` schema, so
-- Supabase's PostgREST endpoint answers for them at /rest/v1/<table> using the
-- anon key — which is public by design and ships inside the frontend bundle.
-- A request with that key returns 200 (not 403), so table-level grants exist;
-- RLS is what makes it return no rows. With RLS off, user_settings — which
-- holds users' encrypted provider keys — is world-readable.
--
-- ENABLING RLS DOES NOT BREAK THE BACKEND: FastAPI connects over a direct
-- Postgres connection as the table owner, and Supabase's `postgres` role has
-- BYPASSRLS, so application queries are unaffected. Enabling RLS with no
-- policies at all is therefore a safe, deny-all default for the PostgREST
-- path. The policies below only matter if the browser ever reads data through
-- supabase-js instead of the API.
--
-- Do NOT use ALTER TABLE ... FORCE ROW LEVEL SECURITY: FORCE subjects the
-- owner to policies too, which would break every backend query.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_research ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (user_id = auth.uid()::text);
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (user_id = auth.uid()::text);

-- Applications
DROP POLICY IF EXISTS applications_all_own ON public.applications;
CREATE POLICY applications_all_own ON public.applications
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- User settings (contains encrypted keys; only the owner may touch their row)
DROP POLICY IF EXISTS settings_all_own ON public.user_settings;
CREATE POLICY settings_all_own ON public.user_settings
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- Company research
DROP POLICY IF EXISTS research_all_own ON public.company_research;
CREATE POLICY research_all_own ON public.company_research
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
