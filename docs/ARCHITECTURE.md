# Architecture & Threat Model

## High-level flow

1. **Client** (React SPA / PWA) signs the user in via **Supabase Auth** and receives a JWT access token.
2. Every API call carries `Authorization: Bearer <jwt>`.
3. **FastAPI** validates the JWT signature/audience (`security.require_user`) and resolves `user_id`.
4. All queries filter by `user_id`; responses never contain raw provider keys.
5. When a generation request arrives, the backend decrypts **only that user's** keys in memory, builds the LLM router, and discards them after the request.
6. LLM providers are tried in order (Gemini → NIM → Ollama) with key×model rotation on rate limits, falling back to demo data if none are configured.

## Security layers (defense in depth)

| Layer | Control |
| --- | --- |
| Transport | HTTPS (Vercel + Render.com), HSTS header |
| Authentication | Supabase Auth; JWT validated per request (`PyJWT`, HS256, audience `authenticated`) |
| Authorization | Every endpoint requires the authenticated user; every query scoped by `user_id` |
| Secret storage | User provider keys encrypted at rest with **Fernet (AES-128-CBC)** using `APP_ENCRYPTION_KEY`; write-only API |
| Key handling | Decrypted only inside the request that uses them; never logged, never returned, masked in UI (`AIza••••1234`) |
| Injection | SQLAlchemy ORM (parameterized); Pydantic validation on all inputs |
| Abuse | `slowapi` rate limits on auth + generation endpoints; CORS locked to `APP_ORIGINS` |
| Headers | CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy |

## Database (SQLAlchemy, Postgres in prod / SQLite in dev)

- `users` — owned by Supabase Auth (`auth.users`); referenced by `user_id` (UUID string).
- `profiles` — resume text + parsed profile per user.
- `applications` — job applications, analysis, ATS results, cover letter, audit trail.
- `user_settings` — provider config + **encrypted** API key blobs (one row per user).
- `company_research` — cached research per user.

## Threat model highlights

**Attacker goals we defend against:**
- *Steal another user's provider API keys* → keys are encrypted at rest; only the owning user's requests can decrypt them; API never returns them; no logging of decrypted values.
- *Read another user's resume/applications* → `user_id` scoping on every query + optional Postgres RLS (`docs/rls.sql`).
- *Impersonate a user* → JWT signature + expiry + audience validation on every request; tokens never stored in localStorage plaintext by us (Supabase manages storage).
- *Burn quota via free tier / abuse the LLM endpoints* → per-user + per-IP rate limits on generation.
- *Compromised client* → keys are server-side; a stolen session token expires; refresh tokens rotate via Supabase.

## Known limitations (roadmap)

- Rate limiter is in-memory (per-instance); multi-instance deploys should back it with Redis.
- Research matcher currently compares against seeded professor papers; integration with a real publication API (e.g. OpenAlex) is planned.
- Demo mode (`APP_ENV != production`) bypasses auth for local development only — must never be deployed.
