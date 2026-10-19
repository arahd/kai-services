// ─── Interfaces (fit_v7) ─────────────────────────────────────────────────────

export interface SkillEvidence {
  name: string;
  role: string;
  context: string;
  type: string;
}

export interface SkillDetail {
  proficiency: string;
  years: number;
  verified?: boolean;
  unverified_reason?: string;
  proof?: SkillEvidence[];
}

export interface JDRequirement {
  proficiency: string;
  years: number;
}

export interface SkillMatchInfo {
  skill: string;
  jd_requires?: JDRequirement;
  candidate_has?: SkillDetail | null;
  match_score: number;
  gap?: string;
  interview_q?: string | null;
}

export interface SkillTier {
  tier_score?: number | string;
  tier_label?: string;
  matched: SkillMatchInfo[];
  partial: SkillMatchInfo[];
  not_found: SkillMatchInfo[];
}

export interface SkillComparison {
  mandatory: SkillTier;
  preferred: SkillTier;
  better_to_have: SkillTier;
}

export interface ExperienceComparison {
  status: string;
  score: number | string;
  jd_requires: { years: number; leadership: boolean };
  candidate_has: { years: number; leadership_evidence: string | null };
}

export interface EducationComparison {
  status: string;
  score: number | string;
  jd_requires: string;
  candidate_has: string;
}

export interface CertificationComparison {
  status: string;
  score: number | string;
  jd_requires: string[];
  candidate_has: string[];
}

export interface ScorecardBreakdown {
  label: string;
  score: number | string;
  weight: number | string;
}

export interface Scorecard {
  total_score: number | string;
  tier: string;
  one_liner: string;
  breakdown: ScorecardBreakdown[];
}

export interface Flag {
  type?: string;
  description?: string;
  severity?: string;
}

export interface FitV7Meta {
  candidate?: string;
  candidate_name?: string;
  company?: string;
  job_title?: string;
  evaluated_on?: string;
  candidate_mail?: string;
  candidate_email?: string;
  candidate_ph?: string;
  candidate_phone?: string;
  candidate_linkedin?: string;
  candidate_website?: string;
  candidate_portfolio?: string;
  candidate_github?: string;
  candidate_location?: string;
}

export interface UiHints {
  tier_thresholds: {
    highly_recommended: number;
    recommended: number;
    reservations: number;
  };
  tier_label_thresholds: { strong: number; moderate: number };
  status_colors: Record<string, string>;
  match_colors: Record<string, string>;
  flag_colors: Record<string, string>;
  verified_colors: Record<string, string>;
  sections_order: string[];
  skill_tier_order: string[];
  within_tier_order: string[];
}

export interface FitV7Data {
  version: string;
  request_id: string;
  generated_at: string;
  meta: FitV7Meta;
  scorecard: Scorecard;
  skill_comparison: SkillComparison;
  experience_comparison: ExperienceComparison;
  education_comparison: EducationComparison;
  certification_comparison: CertificationComparison;
  flags: Flag[];
  ui_hints: UiHints;
}

export interface FailedResume {
  filename: string;
  error: string;
  error_code: string;
  details: string;
  confidence?: number;
  red_flags?: string[];
}
