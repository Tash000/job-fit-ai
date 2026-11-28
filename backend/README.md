# Vitralume Backend Service

High-performance, secure backend API powering the Vitralume Job Application Copilot. Built with **FastAPI**, **LangGraph**, **SQLAlchemy 2.0**, and multi-provider AI backends (**Google Gemini** and **NVIDIA NIM**).

---

## <img src="../docs/icons/layers.svg" width="18" height="18" align="center" alt="" /> Architecture & Key Modules

```
backend/
├── main.py                     # Primary FastAPI application, REST endpoints, and middleware
├── config.py                   # Central environment configuration & secrets loader
├── database.py                 # SQLAlchemy models (User, Profile, Application, ResumeChunk, Settings)
├── services/
│   ├── agent_graph.py          # LangGraph 5-agent state graph pipeline
│   ├── rag.py                  # RAG semantic chunking, vector embeddings, & citation grounding
│   ├── generator.py            # Multi-provider LLM router (Gemini, NVIDIA NIM, Ollama)
│   ├── ats.py                  # Deterministic ATS keyword scoring & dimensional fit
│   ├── job_search.py           # Boolean query generator & 8-platform job directory
│   ├── crypto.py               # AES-256 Fernet encryption for provider keys at rest
│   └── parser.py               # PDF and DOCX resume parsing & structured profile extraction
└── tests/                      # 116+ automated pytest test suite
```

---

## <img src="../docs/icons/cpu.svg" width="18" height="18" align="center" alt="" /> LangGraph 5-Agent Pipeline

The core intelligence layer runs an autonomous, state-driven multi-agent graph:

```
               ┌───────────────────────┐
               │  Raw Job Posting Text │
               └───────────┬───────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   RequirementExtractor  │
              │  (Hard skills & scopes) │
              └────────────┬────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│       RAGRetriever      │ │       ATSEvaluator      │
│  (Semantic resume chunk │ │  (Deterministic keyword │
│   retrieval & ranking)  │ │   coverage & fit score) │
└────────────┬────────────┘ └────────────┬────────────┘
             │                           │
             └─────────────┬─────────────┘
                           ▼
              ┌─────────────────────────┐
              │     HumanCopyWriter     │
              │ (Drafts grounded letter │
              │  free of AI buzzwords)  │
              └────────────┬────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   TruthfulnessCritic    │
              │ (Sentence-level audit   │
              │  against real chunks)   │
              └────────────┬────────────┘
                           │
                  Pass? ───┴─── Fail? (re-route, max 2 iterations)
                    │             │
                    ▼             ▼
             [Final Draft]  [Revision Loop]
```

1. **`RequirementExtractor`**: Isolates mandatory skills, tech stack, and role responsibilities from unstructured job postings.
2. **`RAGRetriever`**: Semantic search across section-aware candidate resume chunks (`[EXP]`, `[PUB]`, `[PROJ]`).
3. **`ATSEvaluator`**: Calculates deterministic keyword matching, identifying matched competencies vs. missing requirements.
4. **`HumanCopyWriter`**: Generates warm, conversational cover letters grounded strictly in real evidence without generic AI fluff.
5. **`TruthfulnessCritic`**: Audits assertions against user's resume chunks via cosine similarity; routes revisions back to the writer if ungrounded assertions are detected.

---

## <img src="../docs/icons/cpu.svg" width="18" height="18" align="center" alt="" /> Dual-Key & Workload Isolation Architecture

Vitralume supports dedicated API keys for different workloads to prevent rate limit contention and enable cost attribution:

### 1. Dedicated Workload Environment Variables
```env
# Dedicated Curation & ATS Embedding Key (uses Google Gemini text-embedding-004)
CURATION_API_KEY=AIzaSy...

# Dedicated LangGraph Multi-Agent Key (uses NVIDIA NIM or Google Gemini)
AGENT_API_KEY=nvapi-...

# Fallback General Server Keys
GEMINI_API_KEY=AIzaSy...
NVIDIA_API_KEY=nvapi-...
```

### 2. Multi-Provider LLM Flexibility
* **Google Gemini**: Uses `google-genai` SDK targeting `gemini-2.5-flash` or `gemini-1.5-flash`.
* **NVIDIA NIM**: OpenAI-compatible endpoint at `https://integrate.api.nvidia.com/v1` targeting `meta/llama-3.3-70b-instruct` or `meta/llama-3.1-8b-instruct`.
* **Zero Canned Fallback**: In production, requests without a valid provider key fail fast rather than returning fake mock data.

---

## <img src="../docs/icons/shield-check.svg" width="18" height="18" align="center" alt="" /> Security & Data Privacy

* **AES-256 Fernet Encryption**: User API keys are encrypted at rest using `cryptography.fernet`. Raw keys are never stored in plaintext, never logged, and never returned to clients.
* **Row-Level User Isolation**: Every database interaction is scoped to the authenticated user's UUID.
* **SlowAPI Rate Limiting**: Defense against denial-of-service on LLM generation and auth endpoints.

---

## <img src="../docs/icons/terminal.svg" width="18" height="18" align="center" alt="" /> Running Backend Tests

Run the complete test suite (116+ tests):

```bash
# Activate virtual environment
venv\Scripts\activate   # Windows
source venv/bin/activate # Linux/macOS

# Run all tests
pytest tests/ -v

# Run agent graph tests specifically
pytest tests/test_agent_graph.py -v
```
