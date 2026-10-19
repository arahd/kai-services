export interface LinkedInCandidate {
  full_name: string;
  current_title: string;
  location: string;
}

export interface WorkExperience {
  company: string;
  title: string;
  start: string;
  end: string | null;
  location: string;
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  end_year: number;
}

export interface Certification {
  name: string;
  issuer: string;
  issue_date: string;
}

export interface ProfileData {
  work_experience?: WorkExperience[];
  experience?: WorkExperience[]; // Used in linkedin_profile
  skills: string[];
  education: Education[];
  certifications: Certification[];
  url?: string;
  fetched_at?: string;
  visibility?: string;
}

export interface Discrepancy {
  category: string;
  item: string;
  resume_value: string;
  linkedin_value: string;
  delta_days: number | null;
  severity: 'low' | 'medium' | 'high';
  action: string;
}

export interface EmploymentCheck {
  company: string;
  title_resume: string;
  title_linkedin: string;
  date_resume: { start: string; end: string | null };
  date_linkedin: { start: string; end: string | null };
  location_resume: string;
  location_linkedin: string;
  consistency_score: number;
  notes: string[];
}

export interface CategoryCheck {
  status: 'pass' | 'warn' | 'fail';
  consistency_score: number;
  details?: EmploymentCheck[];
  mismatches?: any[];
  missing_on_linkedin?: string[];
  missing_on_resume?: string[];
  overclaimed_on_resume?: string[];
}

export interface ConsistencyAssessment {
  overall_consistency_score: number;
  confidence: number;
  summary: string;
  discrepancies: Discrepancy[];
  checks: {
    employment: CategoryCheck;
    titles: CategoryCheck;
    skills: CategoryCheck;
    education: CategoryCheck;
    certifications: CategoryCheck;
  };
  red_flags: string[];
  recommendations: string[];
}

export interface UiHints {
  consistency_thresholds: { pass: number; warn: number };
  sections_order: string[];
}

export interface ConsistencyV2Data {
  request_id: string;
  generated_at: string;
  version: string;
  candidate: LinkedInCandidate;
  resume_profile: ProfileData;
  linkedin_profile: ProfileData;
  consistency_assessment: ConsistencyAssessment;
  ui_hints: UiHints;
}
