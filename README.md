<div align="center">

# 🪟 Vitralume — Job Application Copilot

### https://vitralume.vercel.app

**Glass-clear insight into your job fit.** Upload a resume, paste a job posting, and get
suitability analysis, an ATS scan, research alignment, and cover letters with a
verifiable **Truthfulness Guard** audit trail.

![Web](https://img.shields.io/badge/Web-React%2019-61dafb) ![PWA](https://img.shields.io/badge/PWA-Installable-5a67d8) ![Backend](https://img.shields.io/badge/Backend-FastAPI-009688) ![Auth](https://img.shields.io/badge/Auth-Supabase-3ecf8e) ![DB](https://img.shields.io/badge/DB-PostgreSQL-336791) ![License](https://img.shields.io/badge/License-MIT-blue)

</div>

Vitralume (from *vitral* — glass — and *lume* — light) gives you **crystalline clarity**
on every application: where you fit, where you gap, what the ATS sees, and how your
research lines up with the role — all in one installable app.

## ✨ Features

- **Suitability Analysis** — strength/gap breakdown with an overall match score and a learning roadmap
- **ATS Optimizer** — keyword match rate, weak-bullet detection, section-ordering alerts, and project suggestions
- **Research Matcher** — publication/project overlap scoring against the professor's papers
- **Cover Letter Studio** — plan → edit → generate, with 5 writing styles and iterative **refine** from feedback
- **Truthfulness Guard** — every sentence traced to a source (resume / job ad / publication), verified vs unverified
- **Cover Letter Memory** — cliché phrases you forbid are enforced in the prompt and stripped from output
- **Multi-provider LLM routing** — Google Gemini (key×model rotation on rate limits), NVIDIA NIM, Ollama (local)
- **Multi-user & secure** — Supabase Auth accounts; every user's data isolated; provider API keys encrypted at rest and never exposed
- **One codebase, three surfaces** — responsive website, installable PWA phone app, and installable desktop web app

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Clients (one React + Vite + TS codebase)                    │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ Website (Vercel) │  Phone PWA    │  │ Desktop web app  │  │
│  │  (installable)   │  (installable)│  │  (installable)   │  │
│  └───────────────┘  └───────────────┘  └──────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS · Bearer JWT (Supabase Auth)
┌──────────────────────────▼───────────────────────────────────┐
│  FastAPI Backend  (GCP Cloud Run / any ASGI host)            │
│  ├─ Auth: validates Supabase JWT on every request            │
│  ├─ Services: parser → ats_optimizer → research_matcher      │
│  │            → generator (LLM router) → exporter            │
│  └─ Secrets: user provider keys AES-encrypted, decrypted     │
│             only in memory per request, never returned       │
└──────────────────────────┬───────────────────────────────────┘
                           │ SQLAlchemy
┌──────────────────────────▼───────────────────────────────────┐
│  PostgreSQL (Supabase) · RLS-ready schema, user_id scoping   │
└──────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start (local development)

> No API keys needed to start — the app falls back to realistic demo data.
> Sign-in requires a free [Supabase](https://supabase.com) project (see [Deployment](docs/DEPLOYMENT.md)).

```bash
# 1. Backend
cd backend
python -m venv venv                        # once
venv/Scripts/activate                      # Windows  (Linux/macOS: source venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env                       # then fill in Supabase values (or leave blank for demo mode)
uvicorn main:app --reload --port 8000

# 2. Frontend
cd ../frontend
npm install
npm run dev                                # http://localhost:5173  (proxies /api → :8000)
```

Open **http://localhost:8000** to use the backend-served build, or **http://localhost:5173** during development.

## 📱 Installable App (PWA)

Vitralume is a Progressive Web App — no app store needed.

- **Android / desktop**: open the deployed URL in Chrome/Edge → *Add to Home screen* / *Install* → runs standalone with its own icon.
- Requires the backend to be reachable over **HTTPS** (PWA install is a secure-context-only feature). Vercel + Cloud Run give you that for free.

## 🔐 Security Model

| Concern | How it's handled |
|---|---|
| Login / credentials | Supabase Auth (email+password, hashed by Supabase), JWT validated server-side on every request |
| User data isolation | Every table is scoped by `user_id`; the API only ever queries the authenticated user's rows |
| Provider API keys (Gemini/NIM) | **Encrypted at rest** (AES-256 via Fernet, key from `APP_ENCRYPTION_KEY` env), decrypted in memory only for the request that needs them, **never** returned by the API, masked in the UI |
| Transport | HTTPS everywhere in production; HSTS, CSP and other security headers set by the backend |
| Abuse | Rate limiting on auth and LLM-generation endpoints; CORS locked to your own origins |
| Reporting | See [SECURITY.md](SECURITY.md) |

> **Never commit `.env` files.** Copy `backend/.env.example` → `.env` and fill in your values. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full production setup.

## 📁 Project Structure

```
.
├── backend/
│   ├── main.py            # FastAPI app: all authenticated endpoints
│   ├── config.py          # Environment-based configuration
│   ├── security.py        # JWT auth dependency, key encryption, headers, rate limits
│   ├── database.py        # SQLAlchemy models (Postgres + SQLite dev)
│   ├── services/          # parser, ats_optimizer, research_matcher, generator, exporter
│   └── tests/             # pytest suite
├── frontend/
│   ├── src/
│   │   ├── lib/           # supabase client + auth context + fetch interceptor
│   │   ├── App.tsx        # main application UI
│   │   └── index.css      # design system (dark theme, responsive)
│   └── public/            # icons (generated), favicon
└── docs/
    ├── DEPLOYMENT.md      # Supabase / Vercel / Cloud Run step-by-step
    └── ARCHITECTURE.md    # design decisions & threat model
```

## 🧰 Tech Stack

**Frontend** — React 19 · TypeScript · Vite · `@supabase/supabase-js` · `vite-plugin-pwa` · lucide-react
**Backend** — Python · FastAPI · SQLAlchemy · PyJWT · `cryptography` · slowapi
**Data & Auth** — PostgreSQL on Supabase · Supabase Auth
**LLM providers** — Google Gemini · NVIDIA NIM · Ollama (local fallback)

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md) first. Found a security issue? See [SECURITY.md](SECURITY.md) —
do **not** open a public issue.

## 📄 License

[MIT](LICENSE)
