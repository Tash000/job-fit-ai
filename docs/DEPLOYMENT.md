# Deployment Guide

This guide walks through shipping Vitralume as a public app: a website + an
installable phone/desktop app, backed by a secure multi-user backend.

**Target stack:** Frontend on **Vercel** · Backend on **Render.com (free tier)** · Auth & DB on **Supabase**.

---

## 1. Create the GitHub repository

1. Create a repo on GitHub named **`job-fit-ai`** (or `vitralume` if taken). Make it **Public**.
2. Push the prepared repository from your machine:

```bash
cd D:/Ai/Job_Assistant
git add .
git commit -m "feat: initial Vitralume release"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/job-fit-ai.git
git push -u origin main
```

3. Enable **Issues** and **Discussions** in the repo settings so people can propose contributions.

---

## 2. Supabase (auth + database) — ~5 minutes, free

1. Create a project at [supabase.com](https://supabase.com) (name it `vitralume`).
2. **Project Settings → API** — copy:
   - Project URL (`SUPABASE_URL`)
   - `anon` public key (`SUPABASE_ANON_KEY`)
   - **JWT Secret** (`SUPABASE_JWT_SECRET`)
3. **Project Settings → Database → Connection string** — copy the **Session pooler** URL for `DATABASE_URL`.
4. **SQL Editor** → run [db/schema.sql](../backend/database.py) equivalent — actually the backend creates tables automatically on first start via `init_db()`. No SQL needed.
5. **Authentication → Providers** → enable **Email** (default). Optionally enable Google/GitHub OAuth later.
6. (Optional hardening) Enable **Row Level Security** using the provided policies in `docs/rls.sql` so even direct database access respects user isolation.

---

## 3. Backend on Render.com (free — no credit card)

The Dockerfile lives at `backend/Dockerfile` and listens on the `PORT` env var that
Render provides (no code changes needed). Free tier: 512 MB RAM, 750 hours/month;
the service spins down after 15 min idle and cold-starts in ~30–60 s — fine for a
personal app, optionally kept warm with a cron ping (see below). No billing method
is required.

1. Push the repo to GitHub (the `backend/.dockerignore` keeps your local venv and
   SQLite files out of the image).
2. Sign up at [render.com](https://render.com) with your GitHub account →
   **New + → Web Service** → connect the repo.
3. Configure the service:
   - **Name:** `vitralume-api`
   - **Root Directory:** `backend` ⚠️ (the Dockerfile is inside `backend/`)
   - **Runtime:** Docker (auto-detected)
   - **Region:** nearest to you
   - **Plan:** Free
4. Under **Advanced → Environment**, add these env vars (secrets live here, never in code):

   | Variable | Value |
   | --- | --- |
   | `APP_ENV` | `production` |
   | `DATABASE_URL` | Supabase **Session pooler** connection string |
   | `SUPABASE_URL` | Supabase Project URL |
   | `SUPABASE_ANON_KEY` | Supabase anon public key |
   | `SUPABASE_JWT_SECRET` | Supabase JWT Secret |
   | `APP_ENCRYPTION_KEY` | Fernet master key (44-char urlsafe base64) |
   | `APP_ORIGINS` | the exact Vercel URL, e.g. `https://job-fit-ai.vercel.app` |
   | `APP_PUBLIC_URL` | your Render URL, e.g. `https://vitralume-api.onrender.com` |

5. **Create Web Service** → first build takes ~5–10 min → Render prints your URL
   `https://<service>.onrender.com`. Visit it: you should see the API's JSON message
   (or open `/docs` for the Swagger UI).
6. (Optional) Keep the free instance awake with a free [cron-job.org](https://cron-job.org)
   job that pings `https://<service>.onrender.com/healthz` every 10 minutes.

---

## 4. Frontend on Vercel

1. Push to GitHub, then in Vercel: **Add New Project → Import `job-fit-ai`**.
2. Framework preset: **Vite**. Root directory: `frontend`.
3. Environment variables:
   - `VITE_SUPABASE_URL` = the Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon key
   - `VITE_API_BASE` = `https://<service>.onrender.com` (the Render URL)
4. Deploy → Vercel gives you `https://job-fit-ai.vercel.app` with HTTPS + HSTS automatically.
5. Update the backend's `APP_ORIGINS` to include the Vercel URL.

**No backend rewrite rules needed** — the app calls `VITE_API_BASE` directly (see `frontend/src/lib/api.ts`).

---

## 5. Install on your phone & desktop (PWA)

Nothing to install on the device — the PWA works over HTTPS:

- **Android**: open the Vercel URL in **Chrome** → menu → **Add to Home screen** → it launches full-screen standalone with its icon.
- **iPhone**: open in **Safari** → Share → **Add to Home Screen** (add `apple-touch-icon` is included).
- **Windows/Mac**: open in **Chrome/Edge** → the address-bar install icon (or *Install app*).

> If the install prompt doesn't appear, verify: HTTPS, a valid manifest (check `npm run build` output), and a 192px+ icon (run `npm run icons` first if missing).

---

## 6. Release checklist

- [ ] `pytest` and `npm run build` pass
- [ ] `APP_ENV=production` on the backend; demo mode disabled
- [ ] `APP_ENCRYPTION_KEY` generated and stored in Render env vars
- [ ] CORS `APP_ORIGINS` includes the real frontend URL only
- [ ] `.env` files not committed (`.gitignore` covers them)
- [ ] Backend reachable over HTTPS
- [ ] Test signup → upload resume → analyze → generate → install PWA on a phone

## Environment variable summary

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel | Supabase client init (public) |
| `VITE_SUPABASE_ANON_KEY` | Vercel | Supabase client init (public) |
| `VITE_API_BASE` | Vercel | Backend base URL |
| `SUPABASE_URL/ANON_KEY/JWT_SECRET` | Render | Auth + JWT validation |
| `DATABASE_URL` | Render | Postgres connection (Supabase pooler) |
| `APP_ENCRYPTION_KEY` | Render | Master key for encrypting user API keys |
| `APP_ORIGINS` | Render | Allowed CORS origins |
| `APP_ENV` | Render | `production` |
