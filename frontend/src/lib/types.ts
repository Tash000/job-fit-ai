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
  /** Whether you have submitted an application for this job. */
  applied: boolean
  /** ISO date (YYYY-MM-DD) the job was applied to. */
  applied_date: string | null
  /** Discreet reminder to check up / send a follow-up. */
  follow_up: boolean
  /** Saved for later. */
  bookmarked: boolean
  /** ISO datetime the job was added. */
  created_at: string
  /** ISO datetime the job was last analyzed (null = not analyzed yet). */
  analyzed_at: string | null
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
  keywords: {
    found: string[]
    missing: string[]
    matchRate: number
    fuzzy?: string[]
  }
  weakBullets: { original: string; issues: string[]; suggestion: string }[]
  strongBullets?: number
  orderingAlert?: string
  experience?: {
    requiredYears?: number | null
    resumeYears?: number
    score: number
    alert?: string | null
  }
  formatting?: {
    score: number
    issues: string[]
  }
  qualifications?: {
    score: number
    degree?: string | null
    certifications?: string[]
  }
  breakdown?: {
    components: { keywords: number; experience: number; bullets: number; formatting: number; qualifications: number }
    weights: { keywords: number; experience: number; bullets: number; formatting: number; qualifications: number }
  }
  improvements?: string[]
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

export interface ExperienceEntry {
  role: string
  company: string
  duration: string
  description: string
}

export interface EducationEntry {
  degree: string
  institution: string
  duration: string
  description: string
}

export interface CertificationEntry {
  name: string
  issuer: string
  year: string
}

export interface AchievementEntry {
  title: string
  year: string
  description: string
}

export interface LanguageEntry {
  language: string
  proficiency: string
}

export interface AdditionalSection {
  title: string
  content: string
}

export interface ParsedProfile {
  name: string
  email: string
  phone: string
  address: string
  links: string[]
  career_goals: string
  skills: string[]
  experience: ExperienceEntry[]
  education: EducationEntry[]
  projects: { title: string; technologies: string[]; description: string }[]
  publications: { title: string; authors: string; journal: string; year: number; abstract: string }[]
  certifications: CertificationEntry[]
  achievements: AchievementEntry[]
  languages: LanguageEntry[]
  hobbies: string[]
  declaration: string
  /** Catch-all: any resume section the parser could not map to a standard field. */
  additional_sections: AdditionalSection[]
}

export interface Profile {
  resume_text: string
  /** Friendly nickname used for the dashboard greeting ("Hi {name}…"). */
  display_name: string
  parsed_profile: ParsedProfile
}

export interface Resume {
  id: number
  name: string
  is_active: boolean
  profile_name: string
  created_at: string | null
  updated_at: string | null
}

export interface ResumeLibrary {
  resumes: Resume[]
  max: number
}

export interface Settings {
  gemini_models: string[]
  /** Admin-managed top-5 list; used when gemini_models_custom is false. */
  gemini_default_models?: string[]
  /** False → this account follows the admin-managed platform default. */
  gemini_models_custom?: boolean
  nim_models: string[]
  nim_base_url: string
  ollama_enabled: boolean
  ollama_base_url: string
  ollama_model: string
  active_provider: string
  forbidden_phrases: string[]
  tone_settings: { writingStyle?: string; activeVoice?: boolean; showMetricConfidence?: boolean }
  /** Emails exempt from rate limits and storage caps (admins). */
  admin_emails: string[]
  /** Whether the signed-in account may use the admin console. */
  is_admin?: boolean
  /** True when the account has its OWN provider API key configured. */
  has_own_key?: boolean
  /** Free allowance counters for accounts without their own key. */
  freeUsage?: {
    analysesUsed: number
    analysesLimit: number
    lettersUsed: number
    lettersLimit: number
  }
  // Provider keys are WRITE-ONLY: the API returns only masked previews.
  keyInfo?: {
    gemini: { index: number; masked: string }[]
    nim: { index: number; masked: string }[]
  }
}

/** True when the account must rely on the (limited) platform free allowance. */
export function isUsingFreeAllowance(settings?: Settings | null) {
  return !!settings && !settings.is_admin && !settings.has_own_key
}

/** True when the account's free analysis allowance is fully used. */
export function freeAnalysesExhausted(settings?: Settings | null) {
  const fu = settings?.freeUsage
  if (!fu) return false
  return (fu.analysesUsed ?? 0) >= (fu.analysesLimit ?? 0) && (fu.analysesLimit ?? 0) > 0
}

/** True when the account's free cover-letter allowance is fully used. */
export function freeLettersExhausted(settings?: Settings | null) {
  const fu = settings?.freeUsage
  if (!fu) return false
  return (fu.lettersUsed ?? 0) >= (fu.lettersLimit ?? 0) && (fu.lettersLimit ?? 0) > 0
}

// ── Admin console domain types ───────────────────────────────────────────

export interface AdminOverview {
  totals: {
    users: number
    applications: number
    analyses: number
    resumes: number
    storage_bytes: number
  }
  today: { analyses: number; new_users: number }
  last7d: { analyses: number; active_users: number }
  avg_match: number
  by_provider: Record<string, number>
  limits: { default_analysis: number; default_resume: number }
}

export interface AdminUser {
  user_id: string
  email: string
  display_name: string
  created_at: string | null
  last_seen: string | null
  applications: number
  analyses: number
  resumes: number
  storage_bytes: number
  /** Per-user analysis cap override (null → platform default 500). */
  analysis_limit: number | null
  /** Per-user resume cap override (null → platform default 5). */
  resume_limit: number | null
  is_admin: boolean
}

export interface AdminUserDetail extends AdminUser {
  recent_applications: AppItem[]
}

export interface AdminActivityItem {
  id: number
  user_id: string
  email: string
  action: string
  detail: string
  created_at: string | null
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

/** Green "Applied" tag shown next to the application name. */
export function appliedBadge() {
  return 'badge badge-applied'
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
