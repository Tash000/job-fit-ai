<div align="center">

# Vitralume

### AI Job Application Copilot

**[Live Production Web App](https://vitralume.vercel.app)** · **[Backend API Health](https://job-fit-ai-nzho.onrender.com/health)**

Glass-clear insight into your job fit. Multi-agent ATS keyword evaluation, semantic RAG citation verification, 8-platform job discovery, dual-provider AI workload isolation (Google Gemini + NVIDIA NIM), and hallucination-guarded cover letters.

[![Web](https://img.shields.io/badge/Frontend-React%2019%20%7C%20TypeScript-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![Backend](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python%203.11-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Multi-Agent](https://img.shields.io/badge/Workflow-LangGraph-FF6F00?logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![AI Providers](https://img.shields.io/badge/AI%20Providers-Gemini%20%7C%20NVIDIA%20NIM-76B900?logo=nvidia&logoColor=white)](https://build.nvidia.com/)
[![Database](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com/)
[![PWA](https://img.shields.io/badge/PWA-Installable-5a67d8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

<br />

<img src="docs/screenshots/landing.png" alt="Vitralume Landing Page" width="100%" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" />

</div>

---

## Table of Contents

- [Overview](#overview)
- [Application Gallery](#application-gallery)
- [Core Capabilities](#core-capabilities)
- [Multi-Agent Pipeline Architecture](#multi-agent-pipeline-architecture)
- [Multi-Provider & Dual Keys](#multi-provider--dual-keys)
- [Alpine Design System](#alpine-design-system)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Testing](#testing)
- [API Endpoints](#api-endpoints)
- [Security & Privacy](#security--privacy)
- [License](#license)

---

## <img src="docs/icons/cpu.svg" width="20" height="20" align="center" alt="" /> Overview

Vitralume (*vitral* — stained glass · *lume* — illumination) is a distributed AI copilot designed to eliminate generic, ungrounded applications and ATS rejection:

- **LangGraph 5-Agent Pipeline**: Autonomous state-machine graph dissecting job postings, retrieving verified resume chunks, evaluating ATS compatibility, drafting letters, and auditing factual claims.
- **Deterministic Truthfulness Guard**: Every assertion is cross-checked against indexed resume chunks via cosine similarity with citation tags (`[VERIFIED: EXP § 1]`).
- **Dual-Key & Multi-Provider Isolation**: Dedicated model and quota allocation for Curation/Embeddings vs LangGraph agent reasoning across **Google Gemini** and **NVIDIA NIM** (`meta/llama-3.3-70b-instruct`).
- **Curated Job Finder**: Instant boolean search generation and direct platform deep links across 8 major job platforms.
- **Japanese Teabook Aesthetics**: Color harmonies derived from Sanzo Wada's 1930s classic, Archivo + Fraunces typography, and an installable PWA.

---

## <img src="docs/icons/layers.svg" width="20" height="20" align="center" alt="" /> Application Gallery

<div align="center">

### Executive Dashboard & Application Command Center
<img src="docs/screenshots/dashboard.png" alt="Vitralume Dashboard" width="95%" style="border-radius: 6px; margin-bottom: 24px;" />

<br />

| Job Finder: Curated Board Directory | Job Finder: 5-Agent Copilot |
|:---:|:---:|
| <img src="docs/screenshots/job-finder-boards.png" alt="Job Finder Boards" width="100%" style="border-radius: 6px;" /> | <img src="docs/screenshots/job-finder-copilot.png" alt="Job Finder Copilot" width="100%" style="border-radius: 6px;" /> |

<br />

| Live Audit: ATS Score & Grounded Letter | Live Audit: Keyword Gap Analysis |
|:---:|:---:|
| <img src="docs/screenshots/live-audit-report.png" alt="Live Audit Report" width="100%" style="border-radius: 6px;" /> | <img src="docs/screenshots/live-audit-keywords.png" alt="Keyword Match Analysis" width="100%" style="border-radius: 6px;" /> |

<br />

| Multi-Provider Settings (Light) | Multi-Provider Settings (Cool Obsidian Dark) |
|:---:|:---:|
| <img src="docs/screenshots/dual-keys-settings.png" alt="Settings Light Mode" width="100%" style="border-radius: 6px;" /> | <img src="docs/screenshots/settings-dark-mode.png" alt="Settings Dark Mode" width="100%" style="border-radius: 6px;" /> |

<br />

| Chiseled Roman "V" Brandmark & App Icon | Applications Pipeline Tracker |
|:---:|:---:|
| <img src="docs/screenshots/brand-mark-roman-v.png" alt="Roman V Brandmark" width="45%" style="border-radius: 12px;" /> | <img src="docs/screenshots/applications.png" alt="Applications Tracker" width="100%" style="border-radius: 6px;" /> |
|:---:|:---:|
| <img src="docs/screenshots/applications.png" alt="Applications Tracker" width="100%" style="border-radius: 6px;" /> | <img src="docs/screenshots/resume-profile.png" alt="Resume Profile" width="100%" style="border-radius: 6px;" /> |

</div>

---

## <img src="docs/icons/activity.svg" width="20" height="20" align="center" alt="" /> Core Capabilities

### 1. LangGraph Multi-Agent Pipeline
State-machine pipeline with 5 isolated roles:
- **`RequirementExtractor`**: Separates mandatory vs preferred requirements, years of experience, and skill constraints.
- **`RAGRetriever`**: Semantic vector search retrieving section-aware resume evidence (`[EXP]`, `[PUB]`, `[PROJ]`).
- **`ATSEvaluator`**: Calculates deterministic ATS match percentage, keyword frequency, and missing skills.
- **`HumanCopyWriter`**: Writes concise, natural cover letters using only retrieved candidate facts.
- **`TruthfulnessCritic`**: Audits assertions sentence-by-sentence; loops back to writer on ungrounded claims (up to 2 iterations).

### 2. Personalized Job Finder (`/jobs`)
- **Board Directory**: 1-click boolean search queries across 8 platforms (LinkedIn, Indeed, Wellfound, Google Jobs, Y Combinator, RemoteOK, Glassdoor, ZipRecruiter).
- **AI Job Copilot**: Paste any job description, choose provider (`auto`, `gemini`, `nim`), and run the agent team.
- **Live Audit Report**: Real-time ATS match gauge, grounded letter draft, keyword gap analysis, and 1-click application tracking.

### 3. Semantic RAG Engine
- **Section Chunking**: Parses PDF and DOCX files into categorized chunks (experience, education, publications, projects).
- **Vector Embeddings**: Dense embeddings via Gemini `text-embedding-004` with offline unit-sphere fallback.
- **Traceable Citations**: Line-level verification tags linked to candidate records.

### 4. Workload Isolation & Resilience
- **Dual API Keys**: Isolates high-volume embedding tasks from deep multi-turn LLM agent reasoning.
- **Automatic Fallback**: Automatic provider failover on rate limits or service interruptions.

### 5. Progressive Web App (PWA)
- Offline-ready with Workbox service worker caching.
- Native installation on iOS, Android, macOS, and Windows.

---

## <img src="docs/icons/layers.svg" width="20" height="20" align="center" alt="" /> Multi-Agent Pipeline Architecture

```mermaid
flowchart TD
    A["Raw Job Posting Text"] --> B["Agent 1: RequirementExtractor<br/><i>(Extracts Skills, Scopes & Constraints)</i>"]
    B --> C["Agent 2: RAGRetriever<br/><i>(Semantic Vector Search & Ranking)</i>"]
    B --> D["Agent 3: ATSEvaluator<br/><i>(Deterministic Keyword Match & Score)</i>"]
    C --> E["Agent 4: HumanCopyWriter<br/><i>(Drafts Grounded Letter, Zero Fluff)</i>"]
    D --> E
    E --> F["Agent 5: TruthfulnessCritic<br/><i>(Sentence-by-Sentence Chunk Audit)</i>"]
    F -- "Ungrounded Claims Found<br/>(iteration < max)" --> E
    F -- "Approved or Max Iterations Reached" --> G["Output Artifact:<br/>• Verified Grounded Letter<br/>• ATS Score & Keyword Coverage<br/>• Audit Evidence Trail"]
```

---

## <img src="docs/icons/cpu.svg" width="20" height="20" align="center" alt="" /> Multi-Provider & Dual Keys

Dedicated keys prevent quota bottlenecks and optimize cost-performance across providers:

- **Google Gemini**: Low-latency embedding generation (`text-embedding-004`) and analysis (`gemini-2.5-flash`).
- **NVIDIA NIM**: High-throughput reasoning with hosted models (`meta/llama-3.3-70b-instruct`).

```env
# Dedicated Workload Keys (Optional Overrides)
CURATION_API_KEY=AIzaSy...              # Resume chunking & embeddings
AGENT_API_KEY=nvapi-...                 # LangGraph 5-agent pipeline

# Server Fallback Keys
GEMINI_API_KEY=AIzaSy...                # Google Gemini
NVIDIA_API_KEY=nvapi-...                # NVIDIA NIM
```

---

## <img src="docs/icons/palette.svg" width="20" height="20" align="center" alt="" /> Alpine Design System

Interface styling rooted in classical color harmonies from Sanzo Wada (Combination #217):

- **Primary Alpine Triad**:
  - **Diamine Green** (`#1A7444`): Primary actions, verified badges, active navigation.
  - **Ochraceous Salmon** (`#D8A37B`): Surface cards, secondary metrics, warm borders.
  - **Pale Burnt Lake** (`#802626`): Skill gap alerts, danger actions, lacquer contrast.
- **Cool Obsidian Dark Mode**: Refined slate cards (`#12171E`) on deep obsidian canvas (`#0B0F13`) with luminous emerald green actions (`#22C55E`) and zero reddish tint.
- **Brandmark (Sanzo Wada #232)**:
  - **Deep Indigo** (`#0D1B2A`), **Gilded Starlight Gold** (`#D4AF37`), and **Carmine Wine** (`#6B1724`).
- **Typography**: **Fraunces** serif display, **Archivo** sans body, and **Space Mono** data tags.

---

## <img src="docs/icons/layers.svg" width="20" height="20" align="center" alt="" /> Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Workbox PWA, Lucide Icons, Teabook Design System |
| **Backend** | Python 3.11, FastAPI (ASGI), LangGraph, SQLAlchemy 2.0, Psycopg 3, PyPDF, python-docx |
| **Database & Auth** | PostgreSQL (Supabase Session Pooler), SQLite (local dev), Supabase Auth (JWT) |
| **AI / LLM** | Google Gemini (`google-genai`), NVIDIA NIM (`openai` SDK), Ollama |
| **Security** | AES-256 Fernet key encryption at rest, SlowAPI rate limiting, strict CSP headers |
| **Deployment** | Vercel (Frontend CI/CD), Render (Backend Web Service), GitHub Actions keep-alive |

---

## <img src="docs/icons/terminal.svg" width="20" height="20" align="center" alt="" /> Quick Start

### Prerequisites
- Python 3.10+ (3.11 recommended)
- Node.js 18+ and npm
- (Optional) [Google AI Studio Key](https://aistudio.google.com/) or [NVIDIA NIM Key](https://build.nvidia.com/)

### 1. Clone Repository
```bash
git clone https://github.com/Tash000/job-fit-ai.git
cd job-fit-ai
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate       # Linux/macOS (Windows: venv\Scripts\activate)
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
Interactive API documentation: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```
Local application: `http://localhost:5173`

---

## <img src="docs/icons/terminal.svg" width="20" height="20" align="center" alt="" /> Testing

```bash
# Backend unit & multi-agent test suite (117+ tests)
cd backend
python -m pytest tests/ -v

# Frontend lint, typecheck, and build validation
cd ../frontend
npm run lint          # oxlint static analysis
npm run build         # tsc -b && vite build
npm run csp:check     # Content Security Policy hash verification
```

---

## <img src="docs/icons/activity.svg" width="20" height="20" align="center" alt="" /> API Endpoints

### Multi-Agent & RAG
- `POST /api/pipeline/run-graph` — Executes 5-agent LangGraph workflow (`auto`, `gemini`, `nim`).
- `POST /api/rag/index` — Triggers chunking and vector embedding generation.
- `POST /api/rag/retrieve` — Semantic search retrieving top-K verified resume chunks.
- `POST /api/rag/verify-claim` — Audits a single sentence claim against indexed chunks.

### Job Discovery & Search
- `GET /api/jobs/boards` — Returns curated catalog of supported job boards.
- `GET /api/jobs/personalized-recommendations` — Returns candidate-tailored search recommendations.
- `POST /api/jobs/generate-board-searches` — Generates 1-click boolean search URLs across platforms.

### Core Operations
- `GET /api/applications` & `POST /api/applications` — CRUD for tracked applications.
- `POST /api/analyze` — Suitability evaluation, ATS keyword match, and gap analysis.
- `GET /api/settings` & `PUT /api/settings` — Encrypted key and provider management.

---

## <img src="docs/icons/shield-check.svg" width="20" height="20" align="center" alt="" /> Security & Privacy

- **Encrypted at Rest**: User provider keys are encrypted with AES-256 (`cryptography.fernet`) and decrypted only in memory for active requests.
- **Row-Level Isolation**: All database operations enforce user UUID scoping.
- **Audited Generations**: Generated letters include verifiable citation tags (`[EXP § 1]`).

---

## License

Distributed under the [MIT License](LICENSE).
