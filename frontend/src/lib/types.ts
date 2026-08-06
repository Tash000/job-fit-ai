/**
 * Shared domain types for Vitralume.
 * Centralized so every page/component imports from one place.
 */

export interface AppItem {
  id: number
  company: string
  position: string
  location: string
  status: string
  match_score: number
  created_at: string
}

export interface Suitability {
  overallMatch: number
  technical: number
  research: number
  leadership: number
  communication: number
  strengths: { title: string; desc: string }[]
  weaknesses: { title: string; desc: string }[]
}

export interface Gap {
  skill: string
  effort: string
  resources: string[]
  difficulty: string
  impact: string
}

export interface ATSResult {
  score: number
  keywords: { found: string[]; missing: string[]; matchRate: number }
  weakBullets: { original: string; issues: string[]; suggestion: string }[]
  orderingAlert?: string
  unusedProjects?: { title: string; technologies: string[]; matchingKeywords: string[]; reason: string }[]
}

export interface ResearchMatch {
  alignment: Record<string, number>
  overlaps: { candidatePub: string; professorPub: string; similarity: number; topic: string }[]
  recommendations: string[]
}

export interface PlanItem {
  paragraph: number
  topic: string
  details: string
}

export interface AuditItem {
  sentence: string
  source: string
  status: string
}

export interface Feedback {
  naturalness: number
  grammar: number
  researchFit: number
  specificity: number
  aiRisk: string
  overall: number
}

export interface AppDetail extends AppItem {
  description: string
  details?: {
    jobAnalysis?: Record<string, unknown>
    suitability?: Suitability
    gaps?: Gap[]
    researchMatcher?: ResearchMatch
  }
  resume_suggestions?: ATSResult
  cover_letter_plan?: PlanItem[]
  cover_letter?: string
  audit_trail?: AuditItem[]
  feedback?: Feedback
}

export interface Profile {
  resume_text: string
  parsed_profile: {
    name: string
    email: string
    phone: string
    skills: string[]
    career_goals: string
    projects: { title: string; technologies: string[]; description: string }[]
    publications: { title: string; authors: string; journal: string; year: number; abstract: string }[]
  }
}

export interface Settings {
  gemini_models: string[]
  nim_models: string[]
  nim_base_url: string
  ollama_enabled: boolean
  ollama_base_url: string
  ollama_model: string
  active_provider: string
  forbidden_phrases: string[]
  tone_settings: { writingStyle?: string; activeVoice?: boolean; showMetricConfidence?: boolean }
  // Provider keys are WRITE-ONLY: the API returns only masked previews.
  keyInfo?: {
    gemini: { index: number; masked: string }[]
    nim: { index: number; masked: string }[]
  }
}

export type Notify = (msg: string, type?: 'info' | 'success' | 'error') => void

// ── Presentational helpers ───────────────────────────────────────────

export function scoreClass(s: number) {
  if (s >= 75) return 'high'
  if (s >= 50) return 'medium'
  if (s > 0) return 'low'
  return 'none'
}

export function statusBadge(status: string) {
  const map: Record<string, string> = {
    New: 'badge-new',
    Analyzed: 'badge-analyzed',
    Completed: 'badge-completed',
    Planned: 'badge-analyzed',
  }
  return `badge ${map[status] ?? 'badge-new'}`
}

/** True when the configured AI provider has usable credentials. */
export function isProviderActive(settings?: Settings | null) {
  const provider = settings?.active_provider ?? 'gemini'
  return !!(
    (provider === 'gemini' && (settings?.keyInfo?.gemini?.length ?? 0) > 0) ||
    (provider === 'nim' && (settings?.keyInfo?.nim?.length ?? 0) > 0) ||
    (provider === 'ollama' && settings?.ollama_enabled)
  )
}
