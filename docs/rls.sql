-- ─────────────────────────────────────────────────────────────────────────────
-- Optional defense-in-depth: Row Level Security for Vitralume (Postgres/Supabase)
-- ─────────────────────────────────────────────────────────────────────────────
-- Even if the API layer is bypassed, direct database access can only reach the
-- calling user's own rows. Run this in the Supabase SQL Editor. The backend
-- continues to enforce user_id scoping in the application layer as well.
--
-- NOTE: if you connect to the DB with the postgres superuser (service role),
-- RLS is bypassed by design. Connect as the `authenticated` role via the
-- PostgREST/anon path for RLS to apply.

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
DROP POLICY IF EXISTS profiles_update_own ON public.profiles
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
