<div align="center">

# 🪟 Vitralume — AI Job Application Copilot

### [Live Production Demo](https://vitralume.vercel.app) · [Vercel Preview](https://vitralume-git-test-tash5.vercel.app)

**Glass-clear insight into your job fit.** Multi-agent ATS keyword evaluation, semantic RAG citation verification, curated job board discovery, and hallucination-guarded cover letters.

[![Web](https://img.shields.io/badge/Frontend-React%2019%20%7C%20TypeScript-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![Backend](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python%203.11-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Multi-Agent](https://img.shields.io/badge/Workflow-LangGraph-FF6F00?logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Database](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com/)
[![PWA](https://img.shields.io/badge/PWA-Installable-5a67d8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

<br />

<img src="docs/screenshots/landing.png" alt="Vitralume Landing Page" width="100%" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" />

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Application Gallery](#-application-gallery)
- [Core Capabilities](#-core-capabilities)
- [Multi-Agent Pipeline Architecture](#-multi-agent-pipeline-architecture)
- [Tech Stack](#-tech-stack)
- [Quick Start & Local Setup](#-quick-start--local-setup)
- [Environment Configuration](#-environment-configuration)
- [API Endpoints](#-api-endpoints)
- [Security & Data Privacy](#-security--data-privacy)
- [Deployment Guide](#-deployment-guide)
- [License](#-license)

---

## 🌟 Overview

**Vitralume** (*vitral* — stained glass · *lume* — illumination) is an intelligent job application copilot built for engineers, researchers, and technical professionals.

Rather than generating generic, ungrounded ChatGPT cover letters that trigger ATS rejections, Vitralume combines:
1. **LangGraph 5-Agent Workflow**: Coordinated AI agents that dissect job specs, retrieve verified resume chunks, calculate ATS keyword coverage, and draft grounded prose.
2. **Deterministic Truthfulness Guard**: Every assertion in the generated application letter is cross-checked against your actual indexed resume evidence with automated citation tagging (`[VERIFIED: EXP § 1]`).
3. **Personalized Job Board Directory**: Mines your technical skills and job titles to produce 1-click boolean search queries across 8 curated platforms (LinkedIn, Wellfound, Indeed, Google Jobs, YC, etc.).
4. **Editorial Design System**: High-craft Swiss typography (`Fraunces` display serif, `Archivo` sans, `Space Mono` data), responsive layouts, and an installable offline-capable PWA.

---

## 📸 Application Gallery

<div align="center">

### Executive Dashboard & Application Command Center
<img src="docs/screenshots/dashboard.png" alt="Vitralume Dashboard" width="95%" style="border-radius: 6px; margin-bottom: 24px;" />

<br />

| Application Deep-Dive & ATS Analysis | Tracked Applications & Pipeline |
|:---:|:---:|
| <img src="docs/screenshots/application-detail.png" alt="Application Detail View" width="100%" style="border-radius: 6px;" /> | <img src="docs/screenshots/applications.png" alt="Applications Tracker" width="100%" style="border-radius: 6px;" /> |

<br />

| Structured Resume & Skills Profile | Installable Mobile PWA Experience |
|:---:|:---:|
| <img src="docs/screenshots/resume-profile.png" alt="Resume Profile Editor" width="100%" style="border-radius: 6px;" /> | <img src="docs/screenshots/mobile-view.png" alt="Mobile Dashboard View" width="65%" style="border-radius: 6px;" /> |

</div>

---

## ⚡ Core Capabilities

### 1. 🤖 LangGraph Multi-Agent Pipeline
Vitralume deploys a state-machine multi-agent graph with 5 specialized personas:
* **`RequirementExtractor`**: Isolates mandatory vs. preferred requirements, years of experience, and hard skill constraints from raw job postings.
* **`RAGRetriever`**: Performs semantic search across section-aware resume chunks to surface factual evidence.
* **`ATSEvaluator`**: Calculates deterministic ATS match percentage, keyword frequency, and identifies missing skills.
* **`HumanCopyWriter`**: Generates natural, human-sounding cover letters (A2/B1 readability) using only retrieved resume facts.
* **`TruthfulnessCritic`**: Audits every sentence. If an ungrounded claim is detected, it loops back to the writer for revision (up to 2 iterations).

### 2. 🧭 Personalized Job Finder (`/jobs`)
* **Resume Keyword Mining**: Analyzes candidate resume text to extract primary job title, secondary titles, top technical skills, and domain tags.
* **1-Click Deep Search Generator**: Automatically constructs boolean recruiter queries (`title AND (skill1 OR skill2)`) with direct URL links across 8 top platforms:
  * **LinkedIn**, **Indeed**, **Wellfound (AngelList)**, **Google Jobs**, **Y Combinator (Work at a Startup)**, **RemoteOK**, **Glassdoor**, and **ZipRecruiter**.
* **Embedded Run Console**: Paste any discovered job posting to execute the LangGraph multi-agent team directly from the search directory.

### 3. 🔍 Semantic RAG Engine
* **Section-Aware Chunking**: Automatically breaks uploaded PDFs and text resumes into atomic chunks categorized by experience, publications, projects, and education.
* **Vector Embeddings**: Generates dense embeddings using Google GenAI models and calculates cosine similarity in-memory without requiring complex database extensions.
* **Citation Traceability**: Embeds evidence markers into every generation step.

### 4. 📊 ATS & Suitability Analysis
* 0–100 suitability fit score broken down into technical, research, leadership, and communication dimensions.
* Actionable gap analysis highlighting missing keywords, weak bullet points, and suggested portfolio projects.

### 5. 📱 Installable PWA (Progressive Web App)
* Offline access powered by Workbox service worker precaching.
* Add to home screen on iOS, Android, macOS, and Windows with standalone desktop windowing.

---

## 🏗 Multi-Agent Pipeline Architecture

```
                                  ┌────────────────────────┐
                                  │   Raw Job Posting Text │
                                  └───────────┬────────────┘
                                              │
                                              ▼
                                 ┌───────────────────────────┐
                                 │   RequirementExtractor    │
                                 │   (Skills & Constraints)  │
                                 └────────────┬──────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         ┌─────────────────────────┐                     ┌─────────────────────────┐
         │       RAGRetriever      │                     │       ATSEvaluator      │
         │  (Semantic Vector Search│                     │  (Deterministic Keyword │
         │   & Cosine Similarity)  │                     │   & Fit Score Audit)    │
         └────────────┬────────────┘                     └────────────┬────────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              │ Top-K Grounded Chunks
                                              ▼
                                 ┌───────────────────────────┐
                                 │      HumanCopyWriter      │
                                 │  (Natural, Fact-Grounded  │
                                 │       Draft Creation)     │
                                 └────────────┬──────────────┘
                                              │
                                              ▼
                                 ┌───────────────────────────┐
                                 │    TruthfulnessCritic     │
                                 │ (Sentence-by-Sentence RAG │
                                 │    Hallucination Audit)   │
                                 └────────────┬──────────────┘
                                              │
                             Pass? ───────────┴─────────── Fail? (revision_count < 2)
                               │                                     │
                               ▼                                     ▼
                  ┌────────────────────────┐            ┌─────────────────────────┐
                  │ Output: Grounded Prose │            │ Re-Draft with Strict    │
                  │ + ATS Match Breakdown  │            │ Evidence Boundary Rules │
                  └────────────────────────┘            └─────────────────────────┘
```

---

## 🧰 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Workbox PWA, Lucide React, Swiss Editorial Design System |
| **Backend** | Python 3.11, FastAPI (ASGI), LangGraph, SQLAlchemy 2.0, Psycopg 3, PyPDF, python-docx |
| **Database & Auth** | PostgreSQL (Supabase Session Pooler), Supabase Auth (JWT bearer validation) |
| **AI / LLM** | Google Gemini (`google-genai`), LangGraph state graph, NVIDIA NIM & Ollama (local) |
| **Security** | AES-256 Fernet key encryption at rest, rate limiting (SlowAPI), strict CSP headers |
| **Deployment** | Vercel (Frontend CI/CD), Render (Backend Web Service), GitHub Actions keep-alive |

---

## 🚀 Quick Start & Local Setup

### Prerequisites
* Python 3.10+ (Python 3.11 recommended)
* Node.js 18+ and npm
* (Optional) Free [Google AI Studio API Key](https://aistudio.google.com/) for LLM features

### 1. Clone the Repository
```bash
git clone https://github.com/Tash000/job-fit-ai.git
cd job-fit-ai
```

### 2. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your Supabase credentials and Gemini key (or leave empty for demo mode)

# Start backend server
uvicorn main:app --reload --port 8000
```
* The API documentation will be available at: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
cd ../frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
* The frontend app will be running at: `http://localhost:5173`

---

## 🧪 Running Tests

### Backend Unit & Agent Tests
```bash
cd backend
pytest tests/ -v
```
All new feature suites include:
* `backend/tests/test_agent_graph.py` — LangGraph multi-agent execution & node transitions.
* `backend/tests/test_rag.py` — Section chunking, vector embeddings & cosine verification.
* `backend/tests/test_job_search.py` — Resume keyword mining & boolean search URL generation.

### Frontend Validation & Linting
```bash
cd frontend
npm run lint          # Fast oxlint code quality check
npm run build         # Typecheck (tsc -b) and production bundle build
npm run csp:check     # Content Security Policy hash verification
```

---

## 🔑 Environment Configuration

Create a `.env` file in the `backend/` directory based on `.env.example`:

```env
# Application Mode
APP_ENV=development             # development | production | test
DEMO_MODE=false                 # true permits offline sandbox without Supabase

# Database (PostgreSQL / Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

# Supabase Authentication
SUPABASE_URL=https://[YOUR-PROJECT-ID].supabase.co
SUPABASE_ANON_KEY=[YOUR-ANON-KEY]
SUPABASE_JWT_SECRET=[YOUR-JWT-SECRET]

# Application Encryption Key (AES-256 for user API keys at rest)
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
APP_ENCRYPTION_KEY=[YOUR-FERNET-KEY]

# LLM Providers (Optional platform fallback)
GEMINI_API_KEY=[YOUR-GOOGLE-AI-STUDIO-KEY]

# CORS Allowed Origins
CORS_ORIGINS=http://localhost:5173,https://vitralume.vercel.app
```

---

## 📡 API Endpoints

### Multi-Agent & RAG Endpoints
* `POST /api/pipeline/run-graph` — Executes the 5-agent LangGraph workflow for a given job posting and resume.
* `POST /api/rag/index` — Triggers chunking and vector embedding generation for candidate profile.
* `POST /api/rag/retrieve` — Semantic search retrieving top-K verified evidence chunks.
* `POST /api/rag/verify-claim` — Audits a single sentence assertion against indexed resume chunks.

### Job Search & Board Directory
* `GET /api/jobs/boards` — Returns the directory of supported job boards and platforms.
* `GET /api/jobs/personalized-recommendations` — Mines resume skills and returns tailored search targets.
* `POST /api/jobs/generate-board-searches` — Generates direct 1-click boolean search URLs across platforms.

### Core Endpoints
* `GET /api/applications` & `POST /api/applications` — CRUD for tracked job applications.
* `POST /api/analyze` — Evaluates suitability, ATS keyword match, and strength/gap breakdown.
* `POST /api/generate-cover-letter` — Drafts letter with tone customization and memory filters.
* `GET /api/profile` & `POST /api/profile` — Manages parsed resume skills, publications, and experience.

---

## 🔐 Security & Data Privacy

* **Zero Prompt Leaking**: User API keys are stored encrypted at rest using AES-256 (`cryptography.fernet`). Keys are loaded into memory strictly for the duration of the request and are never logged or returned by the API.
* **Per-Account Row Level Isolation**: All database operations are strictly scoped by the authenticated user's Supabase UUID.
* **Truthfulness Guard**: Eliminates hallucinations by forcing LLM generation to cite verified chunk IDs.
* **Automated Keep-Alive**: GitHub Action workflow continuously pings the health endpoint to prevent cold start latency on free-tier hosting.

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
