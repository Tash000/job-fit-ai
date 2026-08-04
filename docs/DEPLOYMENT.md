# Deployment Guide

This guide walks through shipping Vitralume as a public app: a website + an
installable phone/desktop app, backed by a secure multi-user backend.

**Target stack:** Frontend on **Vercel** · Backend on **Google Cloud Run** · Auth & DB on **Supabase**.

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

## 3. Backend on Google Cloud Run

```bash
# One-time
gcloud auth login
gcloud config set project <your-project-id>
gcloud builds submit --tag gcr.io/<your-project-id>/vitralume-api

# Deploy with secrets as env vars (never in code)
gcloud run deploy vitralume-api \
  --image gcr.io/<your-project-id>/vitralume-api \
  --region europe-west1 \
  --allow-unauthenticated \
  --cpu 2 --memory 1Gi \
  --timeout 300 \
  --set-env-vars "APP_ENV=production" \
  --set-env-vars "DATABASE_URL=postgresql://..." \
  --set-env-vars "SUPABASE_URL=..." \
  --set-env-vars "SUPABASE_ANON_KEY=..." \
  --set-env-vars "SUPABASE_JWT_SECRET=..." \
  --set-env-vars "APP_ENCRYPTION_KEY=..." \
  --set-env-vars "APP_ORIGINS=https://job-fit-ai.vercel.app" \
  --set-env-vars "APP_PUBLIC_URL=https://vitralume-api-xxxx.a.run.app"
```

> A `Dockerfile` is included at the repo root (`backend/Dockerfile`) with a `Procfile` for Cloud Run. The 300s timeout matters: LLM generation can be slow.

---

## 4. Frontend on Vercel

1. Push to GitHub, then in Vercel: **Add New Project → Import `job-fit-ai`**.
2. Framework preset: **Vite**. Root directory: `frontend`.
3. Environment variables:
   - `VITE_SUPABASE_URL` = the Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon key
   - `VITE_API_BASE` = `https://vitralume-api-xxxx.a.run.app` (the Cloud Run URL)
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
- [ ] `APP_ENCRYPTION_KEY` generated and stored in Cloud Run secrets
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
| `SUPABASE_URL/ANON_KEY/JWT_SECRET` | Cloud Run | Auth + JWT validation |
| `DATABASE_URL` | Cloud Run | Postgres connection (Supabase pooler) |
| `APP_ENCRYPTION_KEY` | Cloud Run | Master key for encrypting user API keys |
| `APP_ORIGINS` | Cloud Run | Allowed CORS origins |
| `APP_ENV` | Cloud Run | `production` |
