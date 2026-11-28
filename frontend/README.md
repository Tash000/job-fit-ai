# Vitralume Frontend Service

High-craft, responsive client application for Vitralume. Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Workbox Progressive Web App (PWA)** capabilities.

---

## <img src="../docs/icons/palette.svg" width="24" height="24" align="middle" alt="" /> Alpine & Japanese Teabook Design System

The visual identity is built on classical Japanese color harmonies curated by Sanzo Wada (*A Dictionary of Color Combinations*, Triad #217 / Japanese Teabook 1):

* **Primary Palette (Sanzo Wada #217)**:
  * **Diamine Green** (`#1A7444`): Primary actions, verified badges, active states.
  * **Ochraceous Salmon** (`#D8A37B`): Accent highlights, secondary metrics, and warm badges.
  * **Pale Burnt Lake** (`#802626`): Critical alerts, missing keywords, and danger actions.
* **App Icon & Brandmark (Sanzo Wada #232)**:
  * **Deep Indigo** (`#0D1B2A`): Background shield and depth.
  * **Gilded Starlight Gold** (`#D4AF37`): Chiseled 3D Roman "V" chevron facets.
  * **Carmine Wine** (`#6B1724`): Inner contrast anchor.
* **Typography**:
  * Display Serif: `Fraunces` (warm, editorial character)
  * Body Sans: `Archivo` (crisp, highly readable grotesque sans)
  * Monospace: `Space Mono` (precise tabular statistics and code evidence)

---

## <img src="../docs/icons/layers.svg" width="24" height="24" align="middle" alt="" /> Key Views & Modules

```
frontend/src/
├── pages/
│   ├── Dashboard.tsx        # Overview metrics, ATS readiness, and recent activity
│   ├── JobFinder.tsx        # 3-Tab Job Suite: Job Boards, AI Copilot, and Live Audit Report
│   ├── Applications.tsx     # Kanban and list view for tracked job applications
│   ├── Profile.tsx          # Resume parsing, skill editor, and publication manager
│   ├── Settings.tsx         # Multi-provider API keys (Gemini, NVIDIA NIM, Ollama)
│   └── AdminConsole.tsx     # Admin user management and platform controls
├── components/              # Shared UI cards, badges, modal dialogs, and navigation
├── lib/
│   ├── api.ts               # Global fetch interceptor with automated API_BASE prefixing
│   ├── auth.ts              # Supabase JWT authentication session manager
│   └── theme.ts             # Theme manager & CSS variable injector
└── App.tsx                  # Client router and top-level navigation layout
```

---

## <img src="../docs/icons/search.svg" width="24" height="24" align="middle" alt="" /> Job Finder 3-Tab Suite

1. **Tab 1: Browse Job Boards**:
   * Pre-configured deep search targets across 8 major tech boards: LinkedIn, Indeed, Wellfound, Google Jobs, Y Combinator, RemoteOK, Glassdoor, and ZipRecruiter.
   * Auto-generated boolean query strings with 1-click clipboard copy.
2. **Tab 2: AI Job Copilot**:
   * Instant invocation of the 5-agent LangGraph workflow.
   * Dedicated **AI Engine Selector** to run the agents on **Auto-Detect**, **Google Gemini**, or **NVIDIA NIM (Llama 3.3)**.
3. **Tab 3: Live Audit Report**:
   * Circular ATS fit gauge with dimensional breakdown.
   * Grounded cover letter preview with 1-click "Save & Track in Applications" integration.
   * Sentence-by-sentence truthfulness citation badges (`[EXP § 1]`, `[PUB § 2]`).

---

## <img src="../docs/icons/activity.svg" width="24" height="24" align="middle" alt="" /> Progressive Web App (PWA)

* Fully installable on iOS, Android, macOS, and Windows.
* Standalone window frame with custom title bar theming.
* Workbox precaching for instant load times and offline shell resilience.

---

## <img src="../docs/icons/terminal.svg" width="24" height="24" align="middle" alt="" /> Local Development & Verification

```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev

# Code quality linting (Oxlint)
npm run lint

# Production build and bundle typecheck
npm run build

# Strict Content Security Policy (CSP) hash audit
npm run csp:check
```
