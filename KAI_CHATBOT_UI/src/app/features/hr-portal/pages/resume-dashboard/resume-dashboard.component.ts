import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { HttpEventType } from '@angular/common/http';
import {
  JD_FILE_PROGRESS_MS,
  UploadProgressAnimator,
} from '../../hr-portal-services/upload-progress-animator';
import {
  JdFitService,
  ResumeState,
} from '../../hr-portal-services/jd-fit.service';
import { LinkedInValidationService } from '../../hr-portal-services/linked-in-validation.service';
import { ResumeDashboardSkeletonComponent } from '../../components/resume-dashboard-skeleton/resume-dashboard-skeleton.component';
import { ErrorPageComponent } from '../../error-page/error-page.component';
import { API_RESPONSE_STATUS } from '../../constants/constant';
import { HrIconComponent } from '../../components/hr-icon/hr-icon.component';
import { FailedResume, FitV7Data } from '@features/hr-portal/pages/resume-dashboard/resume-dashboard.model';
import { FileDownloadService } from '@shared/services/file-download.service';
import { ToastService } from '@core/services/toast.service';
import { HttpResponse } from '@angular/common/http';
import { PopupService } from '../../hr-portal-services/popup.service';
import { FileDropzoneComponent } from '../../components/file-dropzone/file-dropzone.component';
import { Router } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-resume-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DecimalPipe,
    ResumeDashboardSkeletonComponent,
    ErrorPageComponent,
    HrIconComponent,
    FileDropzoneComponent,
  ],
  templateUrl: './resume-dashboard.component.html',
  styleUrl: './resume-dashboard.component.scss',
})
export class ResumeDashboardComponent implements OnDestroy {
  private jdFitService = inject(JdFitService);
  private linkedInService = inject(LinkedInValidationService);
  private fileDownloadService = inject(FileDownloadService);
  private toastService = inject(ToastService);
  private popupService = inject(PopupService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  // File Preview Modal state
  previewFile: any | null = null;
  previewFileUrl: string | null = null;
  safePreviewUrl: SafeResourceUrl | null = null;
  previewTextContent: string | null = null;

  get isPreviewImage(): boolean {
    if (!this.previewFile) return false;
    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(this.previewFile.name || '');
  }

  get isPreviewPdf(): boolean {
    if (!this.previewFile) return false;
    return /\.pdf$/i.test(this.previewFile.name || '');
  }

  get isPreviewText(): boolean {
    if (!this.previewFile) return false;
    return /\.(txt|json|csv|xml|js|ts|html|css|py|java|cpp|md|sql)$/i.test(this.previewFile.name || '');
  }

  // perf-ignore
  getFileExtension(name: string): string {
    return (name || '').split('.').pop()?.toUpperCase() || '';
  }

  onPreviewLocalFile(file: File) {
    if (!file) return;

    this.previewFile = file;
    this.previewFileUrl = null;
    this.safePreviewUrl = null;
    this.previewTextContent = null;

    const fileType = file.type;
    
    if (fileType.startsWith('image/')) {
      // It's an image
      this.previewFileUrl = window.URL.createObjectURL(file);
    } else if (fileType === 'application/pdf') {
      // It's a PDF
      const url = window.URL.createObjectURL(file);
      this.previewFileUrl = url;
      this.safePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    } else if (
      fileType.startsWith('text/') ||
      /\.(txt|json|csv|xml|js|ts|html|css|py|java|cpp|md|sql)$/i.test(file.name)
    ) {
      // It's a text file
      const reader = new FileReader();
      reader.onload = () => {
        this.previewTextContent = reader.result as string;
      };
      reader.readAsText(file);
    } else {
      // Unsupported preview type (e.g. DOCX)
      this.previewFileUrl = 'unsupported';
    }
  }

  closeFilePreview() {
    if (this.previewFileUrl && this.previewFileUrl.startsWith('blob:')) {
      window.URL.revokeObjectURL(this.previewFileUrl);
    }
    this.previewFile = null;
    this.previewFileUrl = null;
    this.safePreviewUrl = null;
    this.previewTextContent = null;
  }

  readonly apiResponse = API_RESPONSE_STATUS;

  // ── Signals ────────────────────────────────────────────────────────────────

  private resumeState = toSignal(this.jdFitService.resumeData$, {
    initialValue: {
      status: API_RESPONSE_STATUS.INITIAL,
      data: null,
      blobKey: '',
      viewMode: 'upload',
      multiUploadSummary: null,
      failedResumes: [],
    } as ResumeState,
  });

  status = computed(() => this.resumeState().status);
  blobKey = computed(() => this.resumeState().blobKey);
  errorMsg = computed(() => this.resumeState().error);
  viewMode = computed(() => this.resumeState().viewMode || 'upload');
  multiUploadSummary = computed(() => this.resumeState().multiUploadSummary || null);
  failedResumes = computed(() => this.resumeState().failedResumes || []);

  /** Whether the disqualified documents modal is open */
  isDisqualifiedModalOpen = signal<boolean>(false);

  isDownloading = signal(false);
  isSubmitting = signal(false);
  /** Progress while user picks a file from Browse / drag-drop */
  jdAttaching = signal(false);
  resumeAttaching = signal(false);
  jdAttachProgress = signal(0);
  resumeAttachProgress = signal(0);
  private attachAnimators: {
    jd: UploadProgressAnimator | null;
    resume: UploadProgressAnimator | null;
  } = { jd: null, resume: null };

  // Upload form state (INITIAL)
  uploadTab = signal<'jd' | 'linkedin'>('jd');
  resumeFile: File | null = null;
  jdFile: File | null = null;
  resumeError = '';
  jdError = '';
  submitError = '';
  linkedInUrl = '';
  linkedInUrlError = '';

  // Multi resume upload state
  resumeFiles: File[] = [];
  maxResumes = 5;

  // Backend still expects a `candidate` string in multipart form; UI doesn't collect it yet.
  candidate = 'test';

  /** When route is /hrportal/linkedin-analysis, lock the initial card to LinkedIn mode */
  readonly isLinkedInUploadPage = computed(() =>
    (this.router.url || '').startsWith('/hrportal/linkedin-analysis'),
  );

  /** When route is /hrportal/jd, lock the initial card to JD mode */
  readonly isJdUploadPage = computed(() =>
    (this.router.url || '').startsWith('/hrportal/jd'),
  );

  /** JD or LinkedIn Analysis routes use progress + success upload UI */
  readonly isHrFileAttachPage = computed(
    () => this.isJdUploadPage() || this.isLinkedInUploadPage(),
  );

  ngOnInit() {
    // Ensure the initial tab matches the selected submenu route.
    if (this.isLinkedInUploadPage()) {
      this.uploadTab.set('linkedin');
    } else if (this.isJdUploadPage()) {
      this.uploadTab.set('jd');
    }
  }

  ngOnDestroy() {
    this.cancelAttachAnimation('jd');
    this.cancelAttachAnimation('resume');
  }

  data = computed(() => {
    const raw = this.resumeState().data;
    if (!raw) return null;

    // Support two common API wrapping formats
    if (raw?.data && raw.data.version === 'fit_v7')
      return raw.data as FitV7Data;
    if (raw?.version === 'fit_v7') return raw as FitV7Data;
    return raw as FitV7Data;
  });

  downloadJdFit() {
    const blobKey = this.resumeState().blobKey;
    if (!blobKey) return;

    this.isDownloading.set(true);

    // Explicitly using fallback name in case backend headers are blocked by CORS
    const fallbackFilename = `JD_Fitment_Report_${this.candidateName().replace(/\s+/g, '_')}.pdf`;

    this.jdFitService.downloadJdFit(blobKey).subscribe({
 // perf-ignore
      next: (response: any) => {
        this.fileDownloadService.downloadFile(
          response as HttpResponse<Blob>,
          fallbackFilename,
        );
        this.isDownloading.set(false);
      },
      error: async (err) => {
        console.error('Download failed:', err);

        // Use service to parse binary error into a readable message if possible
        const apiError = await this.fileDownloadService.parseBlobError(err);
        const msg =
          apiError?.message || 'Unable to download report. Please try again.';

        this.toastService.show(msg, 'error');
        this.isDownloading.set(false);
      },
    });
  }

  // ── Derived State (Computed) ───────────────────────────────────────────────

  candidateName = computed(() => {
    const meta = this.data()?.meta;
    return meta?.candidate_name ?? meta?.candidate ?? 'Candidate';
  });
  candidateMail = computed(() => {
    const meta = this.data()?.meta;
    return meta?.candidate_email ?? meta?.candidate_mail;
  });
  candidatePh = computed(() => {
    const meta = this.data()?.meta;
    return meta?.candidate_phone ?? meta?.candidate_ph;
  });
  candidateLocation = computed(() => this.data()?.meta?.candidate_location);
  candidateLinkedin = computed(() => this.data()?.meta?.candidate_linkedin);
  candidateGithub = computed(() => this.data()?.meta?.candidate_github);
  candidateWebsite = computed(() => {
    const meta = this.data()?.meta;
    return meta?.candidate_portfolio ?? meta?.candidate_website;
  });

  ensureUrl(url: string | undefined | null): string {
    if (!url) return '';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  isUrl(value: string | undefined | null): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(trimmed);
  }

  nameFontSize = computed(() => {
    const len = this.candidateName().length;
    if (len > 25) return '14px';
    if (len > 20) return '16px';
    if (len > 15) return '18px';
    return '20px';
  });

  jobTitleFontSize = computed(() => {
    const title = this.data()?.meta?.job_title || '';
    const len = title.length;
    if (len > 35) return '11px';
    if (len > 25) return '13px';
    if (len > 15) return '15px';
    return '16px';
  });

  contactFontSize = computed(() => {
    const nameLen = this.candidateName().length;
    if (nameLen > 25) return '11px';
    if (nameLen > 20) return '12px';
    if (nameLen > 15) return '13px';
    return '14px';
  });

  candidateInitials = computed(() => {
    const name = this.candidateName();
    return name
      .split(' ')
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase() ?? '')
      .join('');
  });

  overallScorePercent = computed(
    () => this.parseScore(this.data()?.scorecard?.total_score),
  );

  private formatWeight(weight: string | number | undefined | null): string {
    if (weight === undefined || weight === null || weight === '') return '';
    const str = String(weight).trim();
    return str.endsWith('%') ? str : `${str}%`;
  }

  breakdownMap = computed(() => {
    const breakdown = this.data()?.scorecard?.breakdown;
    if (!breakdown) return {};
    
    const map: Record<string, { weight: string | number; score: number }> = {};
    breakdown.forEach((item) => {
      if (item && item.label) {
        map[item.label.toLowerCase().trim()] = {
          weight: item.weight,
          score: this.parseScore(item.score),
        };
      }
    });
    return map;
  });

  mandatoryWeightage = computed(() => {
    const w = this.breakdownMap()['mandatory skills']?.weight;
    return w ? this.formatWeight(w) : '40%';
  });

  preferredWeightage = computed(() => {
    const w = this.breakdownMap()['preferred skills']?.weight;
    return w ? this.formatWeight(w) : '20%';
  });

  betterToHaveWeightage = computed(() => {
    const w = this.breakdownMap()['better to have']?.weight;
    return w ? this.formatWeight(w) : '10%';
  });

  educationWeightage = computed(() => {
    const map = this.breakdownMap();
    const w = map['education & certs']?.weight ?? map['education & cert']?.weight;
    return w ? this.formatWeight(w) : '15%';
  });

  experienceWeightage = computed(() => {
    const w = this.breakdownMap()['experience']?.weight;
    return w ? this.formatWeight(w) : '15%';
  });

  tierClass = computed(() => {
    const tier = (this.data()?.scorecard?.tier ?? '').toLowerCase();
    if (tier.includes('highly recommended')) return 'hi';
    if (tier.includes('recommended') && !tier.includes('not')) return 'mid';
    return 'lo';
  });

  scorecardColor = computed(() => {
    const tier = this.tierClass();
    if (tier === 'hi') return '#49AB74';
    if (tier === 'mid') return '#F9C835';
    return '#FB2C36';
  });

  scorecardLightColor = computed(() => {
    const tier = this.tierClass();
    if (tier === 'hi') return '#E0FFEE';
    if (tier === 'mid') return '#FFF5D6';
    return '#FFEAEA';
  });

  getSegmentColor(index: number): string {
    const totalSegments = 15;
    const threshold = (index + 1) * (100 / totalSegments);
    const score = this.overallScorePercent();
    const tier = this.tierClass();
    
    // Define color palette per tier
    const colors = {
      hi: { full: '#49AB74', light: '#E0FFEE' },
      mid: { full: '#F9C835', light: '#FFF5D6' },
      lo: { full: '#FB2C36', light: '#FFEAEA' }
    };
    
    const palette = colors[tier as keyof typeof colors] || colors.lo;

    if (score >= threshold - (100 / totalSegments) / 2) {
      return palette.full;
    }
    return palette.light;
  }

  getSegmentOpacity(index: number): number {
    const totalSegments = 15;
    const threshold = (index + 1) * (100 / totalSegments);
    const score = this.overallScorePercent();
    
    // Full opacity for reached segments.
    // Subtle dimming for the 'shade' segments.
    return score >= threshold - (100 / totalSegments) / 2 ? 1 : 0.8;
  }

  mandatorySkillsLabel = computed(
    () => this.data()?.skill_comparison?.mandatory?.tier_label ?? 'Moderate',
  );

  niceToHaveSkillsLabel = computed(() => {
    const label = this.data()?.skill_comparison?.better_to_have?.tier_label;
    if (label) return label;
    const progress = this.getSkillProgress('better');
    if (progress >= 75) return 'Strong';
    if (progress >= 40) return 'Moderate';
    return 'Weak';
  });

  preferredSkillsLabel = computed(
    () => this.data()?.skill_comparison?.preferred?.tier_label ?? 'Weak',
  );

  // ── Scored Skill Selection ──────────────────────────────────────────────
  // We pool all skills for a tier and re-categorize by match_score for consistency

  private allMandatoryPool = computed(() => {
    const s = this.data()?.skill_comparison?.mandatory;
    console.log(s, 'mandatory');
    return s
      ? [...(s.matched ?? []), ...(s.partial ?? []), ...(s.not_found ?? [])]
      : [];
  });

  private allPreferredPool = computed(() => {
    const s = this.data()?.skill_comparison?.preferred;
    console.log(s, 'preffered');
    return s
      ? [...(s.matched ?? []), ...(s.partial ?? []), ...(s.not_found ?? [])]
      : [];
  });

  private allBetterToHavePool = computed(() => {
    const s = this.data()?.skill_comparison?.better_to_have;
    console.log(s, 'nice to have');
    return s
      ? [...(s.matched ?? []), ...(s.partial ?? []), ...(s.not_found ?? [])]
      : [];
  });

  mandatoryMatched = computed(() =>
    this.allMandatoryPool().filter((s) => s.match_score >= 1),
  );
  mandatoryPartial = computed(() =>
    this.allMandatoryPool().filter(
      (s) => s.match_score > 0 && s.match_score < 1,
    ),
  );
  mandatoryGap = computed(() =>
    this.allMandatoryPool().filter((s) => s.match_score === 0),
  );

  preferredMatched = computed(() =>
    this.allPreferredPool().filter((s) => s.match_score >= 1),
  );
  preferredPartial = computed(() =>
    this.allPreferredPool().filter(
      (s) => s.match_score > 0 && s.match_score < 1,
    ),
  );
  preferredGap = computed(() =>
    this.allPreferredPool().filter((s) => s.match_score === 0),
  );

  betterToHaveMatched = computed(() =>
    this.allBetterToHavePool().filter((s) => s.match_score >= 1),
  );
  betterToHavePartial = computed(() =>
    this.allBetterToHavePool().filter(
      (s) => s.match_score > 0 && s.match_score < 1,
    ),
  );
  betterToHaveGap = computed(() =>
    this.allBetterToHavePool().filter((s) => s.match_score === 0),
  );

  mandatorySkills = computed(() => this.allMandatoryPool());

  niceToHaveSkills = computed(() => this.allBetterToHavePool());

  preferredSkills = computed(() => this.allPreferredPool());

  expCandidateBarWidth = computed(() => {
    const cur = this.data()?.experience_comparison?.candidate_has?.years ?? 0;
    const req = this.data()?.experience_comparison?.jd_requires?.years ?? 1;
    return Math.min((cur / (req * 1.5)) * 100, 100);
  });

  expRequiredMarkerLeft = computed(() => {
    const req = this.data()?.experience_comparison?.jd_requires?.years ?? 1;
    return (req / (req * 1.5)) * 100;
  });

  experienceExcess = computed(() => {
    const cur = this.data()?.experience_comparison?.candidate_has?.years ?? 0;
    const req = this.data()?.experience_comparison?.jd_requires?.years ?? 0;
    return Number((cur - req).toFixed(1));
  });

  experienceScore = computed(() =>
    this.parseScore(this.data()?.experience_comparison?.score),
  );

  // perf-ignore
  getSkillMatchText(category: 'mandatory' | 'preferred' | 'better'): string {
    const data = this.data()?.skill_comparison;
    if (!data) return '';
    
    let tier = '';
    let rawScore: any = undefined;
    
    if (category === 'mandatory') {
      tier = data.mandatory?.tier_label || 'Mandatory';
      rawScore = data.mandatory?.tier_score;
    } else if (category === 'preferred') {
      tier = data.preferred?.tier_label || 'Preferred';
      rawScore = data.preferred?.tier_score;
    } else {
      tier = data.better_to_have?.tier_label || 'Better to have';
      rawScore = data.better_to_have?.tier_score;
    }

    const score = rawScore !== undefined && rawScore !== null
      ? this.parseScore(rawScore)
      : this.getSkillProgress(category);

    if (score >= 100) return `${tier} match found`;
    if (score >= 70) return `${tier} match with minor gaps`;
    if (score >= 40) return `${tier} match for core requirements`;
    return `Significant gaps found in ${category} skills`;
  }

  hasCertGap = computed(() => {
    return (
      (this.data()?.certification_comparison?.status ?? '').toLowerCase() !==
      'met'
    );
  });

  certificationDetails = computed(() => {
    const cert = this.data()?.certification_comparison;
    if (!cert) return [];

    const req = cert.jd_requires ?? [];
    const has = cert.candidate_has ?? [];

    const details = req.map((name) => ({
      name,
      type: 'Required',
      held: has.includes(name),
      status: has.includes(name) ? 'Present' : 'Missing',
    }));

    has.forEach((name) => {
      if (!req.includes(name)) {
        details.push({
          name,
          type: 'Preferred',
          held: true,
          status: 'Present',
        });
      }
    });

    return details;
  });

  certificationRecommendation = computed(() => {
    const cert = this.data()?.certification_comparison;
    if (!cert || cert.status === 'Met') return null;

    const missing =
      cert.jd_requires?.filter((r) => !cert.candidate_has?.includes(r)) ?? [];
    if (missing.length === 0) return null;

    return `${missing.join(', ')} cert missing — recommend asking about relevant experience in interview`;
  });

  matchedCertifications = computed(() => {
    const cert = this.data()?.certification_comparison;
    if (!cert) return [];
    const req = cert.jd_requires ?? [];
    const has = cert.candidate_has ?? [];

    return req
      .filter((name) => has.some((h) => h.toLowerCase().includes(name.toLowerCase())))
      .map((name) => {
        const match = has.find((h) => h.toLowerCase().includes(name.toLowerCase())) || '';
        let candidateText = 'Held';
        if (match) {
          const lower = match.toLowerCase();
          if (lower.includes('held')) {
            const index = lower.indexOf('held');
            candidateText = match.substring(index);
            candidateText = candidateText.charAt(0).toUpperCase() + candidateText.slice(1);
          } else {
            const parts = match.split(/[,()]/);
            if (parts.length > 1) {
              candidateText = parts[parts.length - 1].trim();
            }
          }
        }
        return {
          name: name,
          type: 'Required',
          candidateText: candidateText
        };
      });
  });

  notMatchedCertifications = computed(() => {
    const cert = this.data()?.certification_comparison;
    if (!cert) return [];
    const req = cert.jd_requires ?? [];
    const has = cert.candidate_has ?? [];

    return req
      .filter((name) => !has.some((h) => h.toLowerCase().includes(name.toLowerCase())))
      .map((name) => ({
        name: name,
        type: 'Required',
        candidateText: 'Not Held'
      }));
  });

  matchedCertsCount = computed(() => this.matchedCertifications().length);
  totalCertsCount = computed(() => (this.data()?.certification_comparison?.jd_requires ?? []).length);

  experienceStatusText = computed(() => {
    const excess = this.experienceExcess();
    if (excess > 0) {
      return `Exceeds requirement by ${excess} ${excess === 1 ? 'year' : 'years'}`;
    } else if (excess === 0) {
      return 'Meets requirement';
    } else {
      const shortfall = Math.abs(excess);
      return `Short of requirement by ${shortfall} ${shortfall === 1 ? 'year' : 'years'}`;
    }
  });

  experienceStatusClass = computed(() => {
    const excess = this.experienceExcess();
    return excess >= 0 ? 'exp-banner--meets' : 'exp-banner--short';
  });

  experienceCandidateColor = computed(() => {
    const excess = this.experienceExcess();
    return excess >= 0 ? '#059669' : '#dc2626'; // Green if meets/exceeds, red if short
  });

  expProgressBarWidth = computed(() => {
    const cur = this.data()?.experience_comparison?.candidate_has?.years ?? 0;
    const req = this.data()?.experience_comparison?.jd_requires?.years ?? 1;
    if (req === 0) return 100;
    return Math.min((cur / req) * 100, 100);
  });

  detailedFitAnalysis = computed(() => {
    const data = this.data();
    if (!data) return [];

    const analysis = [];

    // 1. Experience Match
    const exp = data.experience_comparison;
    const candYears = exp?.candidate_has?.years ?? 0;
    const reqYears = exp?.jd_requires?.years ?? 0;
    const expDiff = candYears - reqYears;
    const expPct =
      reqYears > 0
        ? Math.round((expDiff / reqYears) * 100)
        : 0;
    analysis.push({
      title: 'Experience Match',
      description: `Candidate has ${candYears} years vs required ${reqYears}+ years - ${expDiff >= 0 ? 'Exceeds' : 'Falls short of'} requirement by ${Math.abs(expPct)}%`,
      status: this.parseScore(exp?.score) >= 70 ? 'met' : 'gap',
    });

    // 2. Technical Skills
    const totalScore = this.parseScore(data.scorecard?.total_score);
    const topSkills = [
      ...(data.skill_comparison?.mandatory?.matched || []),
      ...(data.skill_comparison?.preferred?.matched || []),
    ]
      .slice(0, 4)
      .map((s) => s.skill)
      .join(', ');
    analysis.push({
      title: 'Technical Skills',
      description: `${totalScore}% skill match - ${topSkills ? 'Strong proficiency in ' + topSkills : 'Review required skills'}`,
      status: totalScore >= 70 ? 'met' : 'gap',
    });

    // 3. Leadership Evidence
    const lead = exp?.candidate_has?.leadership_evidence;
    analysis.push({
      title: 'Leadership Evidence',
      description:
        lead || 'No significant leadership evidence found in resume.',
      status: lead ? 'met' : 'gap',
    });

    // 4. Additional Skills
    const additional = (data.skill_comparison?.better_to_have?.matched || [])
      .slice(0, 3)
      .map((s) => s.skill)
      .join(', ');
    analysis.push({
      title: 'Additional Skills',
      description: additional
        ? `Candidate brings extra expertise in ${additional}`
        : 'No additional skills found beyond requirements.',
      status: additional ? 'met' : 'gap',
    });

    return analysis;
  });

  scoreRingGradient = computed(() => {
    const raw = this.overallScorePercent();
    const deg = (raw / 100) * 360;
    const color =
      this.tierClass() === 'hi'
        ? '#2d9e62'
        : this.tierClass() === 'mid'
          ? '#1a4fa8'
          : '#e08530';
    return `conic-gradient(${color} 0deg ${deg}deg, #eceae4 ${deg}deg 360deg)`;
  });

  matchedCount = computed(() => {
    let count = 0;
    count += this.mandatoryMatched().length;
    count += this.preferredMatched().length;
    count += this.betterToHaveMatched().length;
    if (this.data()?.experience_comparison?.status === 'Met') count++;
    if (this.data()?.education_comparison?.status === 'Met') count++;
    return count;
  });

  partialCount = computed(() => {
    let count = 0;
    count += this.mandatoryPartial().length;
    count += this.preferredPartial().length;
    count += this.betterToHavePartial().length;
    if (this.data()?.experience_comparison?.status === 'Partial') count++;
    if (this.data()?.education_comparison?.status === 'Partial') count++;
    return count;
  });

  gapCount = computed(() => {
    let count = 0;
    count += this.mandatoryGap().length;
    count += this.preferredGap().length;
    count += this.betterToHaveGap().length;
    const expStatus = this.data()?.experience_comparison?.status;
    if (expStatus && expStatus !== 'Met' && expStatus !== 'Partial') count++;
    const eduStatus = this.data()?.education_comparison?.status;
    if (eduStatus && eduStatus !== 'Met' && eduStatus !== 'Partial') count++;
    return count;
  });

  // ── Interactivity ──────────────────────────────────────────────────────────

  activeSkillTier = signal<'all' | 'mandatory' | 'nice_to_have' | 'preferred'>(
    'all',
  );

  setSkillTier(tier: 'all' | 'mandatory' | 'nice_to_have' | 'preferred') {
    this.activeSkillTier.update((current) => (current === tier ? 'all' : tier));
  }

  activePopup = signal<
    | 'mandatory'
    | 'preferred'
    | 'nice_to_have'
    | 'experience'
    | 'education'
    | null
  >(null);

  openDetailPopup(label: string) {
    const l = label.toLowerCase();
    if (l.includes('mandatory')) this.activePopup.set('mandatory');
    else if (l.includes('preferred')) this.activePopup.set('preferred');
    else if (l.includes('better')) this.activePopup.set('nice_to_have');
    else if (l.includes('experience')) this.activePopup.set('experience');
    else if (l.includes('education')) this.activePopup.set('education');
  }

  closeDetailPopup() {
    this.activePopup.set(null);
  }

  getPopupTitle(): string {
    const type = this.activePopup();
    if (type === 'mandatory') return 'Mandatory Skills Breakdown';
    if (type === 'preferred') return 'Preferred Skills Breakdown';
    if (type === 'nice_to_have') return 'Better to Have Skills Breakdown';
    if (type === 'experience') return 'Experience Comparison Detail';
    if (type === 'education') return 'Education & Certs Detail';
    return 'Details';
  }

  activeMatchedSkills = computed(() => {
    const type = this.activePopup();
    if (type === 'mandatory') return this.mandatoryMatched();
    if (type === 'preferred') return this.preferredMatched();
    if (type === 'nice_to_have') return this.betterToHaveMatched();
    return [];
  });

  activePartialSkills = computed(() => {
    const type = this.activePopup();
    if (type === 'mandatory') return this.mandatoryPartial();
    if (type === 'preferred') return this.preferredPartial();
    if (type === 'nice_to_have') return this.betterToHavePartial();
    return [];
  });

  activeGapSkills = computed(() => {
    const type = this.activePopup();
    if (type === 'mandatory') return this.mandatoryGap();
    if (type === 'preferred') return this.preferredGap();
    if (type === 'nice_to_have') return this.betterToHaveGap();
    return [];
  });

  activeTotalSkills = computed(() => {
    const type = this.activePopup();
    if (type === 'mandatory') return this.mandatorySkills().length;
    if (type === 'preferred') return this.preferredSkills().length;
    if (type === 'nice_to_have') return this.niceToHaveSkills().length;
    return 0;
  });

  onRetry() {
    this.onNewAnalysis();
    this.popupService.setActivePopup('jd');
    this.popupService.openPopup();
  }

  onSelectResume(file: File | null) {
    this.onSelectResumeSingleOrMulti(file);
  }

  onSelectResumeSingleOrMulti(file: File | null) {
    if (this.uploadTab() === 'linkedin') {
      this.resumeError = '';
      this.submitError = '';
      if (!file) {
        this.cancelAttachAnimation('resume');
        this.resumeFile = null;
        return;
      }
      const validated = this.validateUpload(file, 'Resume');
      if (!validated) return;
      if (this.isHrFileAttachPage()) {
        this.animateLocalFileAttach('resume', validated);
        return;
      }
      this.resumeFile = validated;
    } else {
      if (file) {
        this.onSelectMultipleResumes([file]);
      }
    }
  }

  async onSelectMultipleResumes(files: File[]) {
    this.resumeError = '';
    this.submitError = '';
    
    for (const file of files) {
      if (this.resumeFiles.length >= this.maxResumes) {
        this.resumeError = `You can only upload up to ${this.maxResumes} resumes.`;
        this.toastService.show(this.resumeError, 'error');
        break;
      }
      const validated = this.validateUpload(file, 'Resume');
      if (validated) {
        // Name-based duplicate check
        if (this.resumeFiles.some(f => f.name === validated.name)) {
          continue;
        }

        // Content-based duplicate check
        let isDuplicate = false;
        for (const existing of this.resumeFiles) {
          if (await this.isDuplicateContent(existing, validated)) {
            isDuplicate = true;
            this.resumeError = `Duplicate content detected for file: ${validated.name}`;
            this.toastService.show(this.resumeError, 'info');
            break;
          }
        }

        if (!isDuplicate) {
          this.resumeFiles.push(validated);
        }
      }
    }
  }

  private async isDuplicateContent(file1: File, file2: File): Promise<boolean> {
    if (file1.size !== file2.size) return false;
    try {
      const [buf1, buf2] = await Promise.all([
        file1.arrayBuffer(),
        file2.arrayBuffer()
      ]);
      const arr1 = new Uint8Array(buf1);
      const arr2 = new Uint8Array(buf2);
      if (arr1.length !== arr2.length) return false;
      for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) return false;
      }
      return true;
    } catch (e) {
      console.error('Error comparing files:', e);
      return false;
    }
  }

  removeResumeFile(index: number) {
    this.resumeFiles.splice(index, 1);
    this.resumeError = '';
  }

  onSelectJd(file: File | null) {
    this.jdError = '';
    this.submitError = '';
    if (!file) {
      this.cancelAttachAnimation('jd');
      this.jdFile = null;
      return;
    }
    const validated = this.validateUpload(file, 'Job Description');
    if (!validated) return;
    if (this.isJdUploadPage()) {
      this.animateLocalFileAttach('jd', validated);
      return;
    }
    this.jdFile = validated;
  }

  private cancelAttachAnimation(slot: 'jd' | 'resume') {
    this.attachAnimators[slot]?.cancel();
    this.attachAnimators[slot] = null;
    if (slot === 'jd') {
      this.jdAttaching.set(false);
      this.jdAttachProgress.set(0);
    } else {
      this.resumeAttaching.set(false);
      this.resumeAttachProgress.set(0);
    }
  }

  /** JD / LinkedIn Analysis: show progress UI before revealing the attached filename. */
  private animateLocalFileAttach(slot: 'jd' | 'resume', file: File) {
    this.cancelAttachAnimation(slot);
    const attaching = slot === 'jd' ? this.jdAttaching : this.resumeAttaching;
    const progress = slot === 'jd' ? this.jdAttachProgress : this.resumeAttachProgress;

    attaching.set(true);
    progress.set(0);

    const animator = new UploadProgressAnimator(
      ({ resume }) => progress.set(resume),
      () => {
        this.cancelAttachAnimation(slot);
        if (slot === 'jd') {
          this.jdFile = file;
        } else {
          this.resumeFile = file;
        }
      },
      { dualFile: false, minDurationMs: JD_FILE_PROGRESS_MS, localAttach: true },
    );
    this.attachAnimators[slot] = animator;
    animator.start();
  }

  setUploadTab(tab: 'jd' | 'linkedin') {
    this.uploadTab.set(tab);
    this.submitError = '';
    this.linkedInUrlError = '';
  }

  private validateUpload(file: File | null, label: 'Resume' | 'Job Description') {
    if (!file) return null;

    const name = file.name?.toLowerCase() ?? '';
    const isPDF = file.type === 'application/pdf' || name.endsWith('.pdf');
    const isDOCX =
      file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx');

    if (!isPDF && !isDOCX) {
      const msg = 'Only PDF and DOCX files are allowed';
      if (label === 'Resume') this.resumeError = msg;
      else this.jdError = msg;
      return null;
    }

    return file;
  }

  canSubmit = computed(() => {
    if (
      this.isSubmitting() ||
      this.jdAttaching() ||
      this.resumeAttaching()
    ) {
      return false;
    }
    if (this.uploadTab() === 'jd') {
      return this.resumeFiles.length > 0 && !!this.jdFile;
    }
    return !!this.resumeFile && !!this.linkedInUrl?.trim();
  });

  onAnalyzeJdFit() {
    if (this.resumeFiles.length >= 1) {
      this.submitMultipleJdFit();
    }
  }

  submitJdFit() {
    this.submitError = '';

    if (!this.resumeFile) {
      this.resumeError = 'Resume is required';
      return;
    }
    if (!this.jdFile) {
      this.jdError = 'Job Description is required';
      return;
    }

    this.isSubmitting.set(true);
    const resume = this.resumeFile;
    const jd = this.jdFile;

    this.jdFitService
      .uploadFiles(resume, jd, this.candidate)
      .pipe(catchError((err) => of({ isError: true, error: err })))
      .subscribe((event: any) => {
 // perf-ignore
        if (event?.isError) {
          const errorMsg =
            event?.error?.error?.error || 'Something went wrong. Please try again';
          this.jdFitService.setResumeState({
            status: API_RESPONSE_STATUS.INITIAL,
            data: null,
            blobKey: '',
            error: errorMsg,
          });
          this.submitError = errorMsg;
          this.toastService.show(errorMsg, 'error');
          this.isSubmitting.set(false);
          return;
        }

        if (event.type === HttpEventType.Response) {
          const res = event.body;
          this.jdFitService.setResumeState({
            status: API_RESPONSE_STATUS.SUCCESS,
            data: res?.data,
            blobKey: res?.blob_key ?? '',
            viewMode: 'single-result',
            multiUploadSummary: null,
          });
          this.isSubmitting.set(false);
        }
      });
  }

  submitMultipleJdFit() {
    this.submitError = '';
    if (this.resumeFiles.length === 0) {
      this.resumeError = 'At least one resume is required';
      return;
    }
    if (!this.jdFile) {
      this.jdError = 'Job Description is required';
      return;
    }

    this.isSubmitting.set(true);

    this.jdFitService
      .uploadMultipleFiles(this.resumeFiles, this.jdFile)
      .pipe(catchError((err) => of({ isError: true, error: err })))
      .subscribe((event: any) => {
 // perf-ignore
        if (event?.isError) {
          const errorMsg =
            event?.error?.error?.error || 'Something went wrong. Please try again';
          this.jdFitService.setResumeState({
            status: API_RESPONSE_STATUS.INITIAL,
            data: null,
            blobKey: '',
            error: errorMsg,
            viewMode: 'upload',
            multiUploadSummary: null,
          });
          this.submitError = errorMsg;
          this.toastService.show(errorMsg, 'error');
          this.isSubmitting.set(false);
          return;
        }

        if (event.type === HttpEventType.Response) {
          const res = event.body;
          const failedList: FailedResume[] = res?.failed_resumes || [];
          const rankedCandidates = res?.summary?.ranked_candidates || [];

          if (res && res.success && (res.summary || failedList.length)) {
            this.jdFitService.setResumeState({
              status: API_RESPONSE_STATUS.SUCCESS,
              data: null,
              blobKey: '',
              viewMode: 'multiple-results',
              multiUploadSummary: res.summary || null,
              failedResumes: failedList,
            });
          } else {
            const errorMsg = 'Failed to process multiple resumes';
            this.jdFitService.setResumeState({
              status: API_RESPONSE_STATUS.INITIAL,
              data: null,
              blobKey: '',
              error: errorMsg,
              viewMode: 'upload',
              multiUploadSummary: null,
              failedResumes: [],
            });
            this.submitError = errorMsg;
            this.toastService.show(errorMsg, 'error');
          }
          this.isSubmitting.set(false);
        }
      });
  }

  viewSingleCandidate(blobKey: string) {
    this.isSubmitting.set(true);
    this.jdFitService.setResumeState({
      status: API_RESPONSE_STATUS.PENDING,
      data: null,
      blobKey: '',
      viewMode: 'single-result',
    });

    this.jdFitService.retrieveBlobData(blobKey).subscribe({
 // perf-ignore
      next: (res) => {
        this.jdFitService.setResumeState({
          status: API_RESPONSE_STATUS.SUCCESS,
          data: res?.data ?? res,
          blobKey: blobKey,
          viewMode: 'single-result',
        });
        this.isSubmitting.set(false);
      },
      error: (err) => {
        console.error('Failed to retrieve candidate details:', err);
        const errorMsg = 'Unable to load candidate details. Please try again.';
        this.toastService.show(errorMsg, 'error');
        this.isSubmitting.set(false);
        this.jdFitService.setResumeState({
          status: API_RESPONSE_STATUS.SUCCESS,
          data: null,
          blobKey: '',
          viewMode: 'multiple-results',
        });
      }
    });
  }

  backToCandidates() {
    this.jdFitService.setResumeState({
      status: API_RESPONSE_STATUS.SUCCESS,
      data: null,
      blobKey: '',
      viewMode: 'multiple-results',
    });
  }

  backToUpload() {
    this.onNewAnalysis();
  }

  parseScore(scoreStr: string | number | undefined | null): number {
    if (scoreStr === undefined || scoreStr === null) return 0;
    if (typeof scoreStr === 'number') return scoreStr;
    const parsed = parseInt(String(scoreStr).replace(/[^0-9]/g, ''), 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  getSkillsMatchInfo(tier: string, score: number): { text: string; cssClass: string } {
    const t = (tier || '').toLowerCase();
    if (t.includes('highly recommended') || score >= 80) {
      return { text: 'Strong Fit', cssClass: 'pill-strong-fit' };
    } else if (t.includes('not recommended') || score < 50) {
      return { text: 'Reject', cssClass: 'pill-reject' };
    } else if (t.includes('recommended') || (score >= 70 && score < 80)) {
      return { text: 'Good Fit', cssClass: 'pill-good-fit' };
    } else {
      return { text: 'On Hold', cssClass: 'pill-on-hold' };
    }
  }

  submitLinkedIn() {
    this.submitError = '';
    this.linkedInUrlError = '';

    if (!this.linkedInUrl?.trim()) {
      this.linkedInUrlError = 'LinkedIn URL is required';
      return;
    }
    if (!this.resumeFile) {
      this.resumeError = 'Resume is required';
      return;
    }

    this.isSubmitting.set(true);
    const resume = this.resumeFile;

    this.linkedInService
      .validateLinkedInUrl(resume, null, this.linkedInUrl.trim())
      .pipe(catchError((err) => of({ isError: true, error: err })))
      .subscribe((res: any) => {
 // perf-ignore
        if (res?.isError) {
          const errorMsg =
            res?.error?.error?.error || 'Something went wrong. Please try again';
          this.linkedInService.setLinkedInState({
            status: API_RESPONSE_STATUS.INITIAL,
            data: null,
            error: errorMsg,
          });
          this.submitError = errorMsg;
          this.toastService.show(errorMsg, 'error');
          this.isSubmitting.set(false);
          return;
        }

        this.linkedInService.setLinkedInState({
          status: API_RESPONSE_STATUS.SUCCESS,
          data: res?.data,
        });
        this.popupService.setActivePopup('linkedin');
        this.isSubmitting.set(false);
      });
  }

  onNewAnalysis() {
    this.jdFitService.reset();
    this.isDisqualifiedModalOpen.set(false);
    this.resumeFile = null;
    this.jdFile = null;
    this.resumeFiles = [];
    this.linkedInUrl = '';
    this.submitError = '';
    this.resumeError = '';
    this.jdError = '';
  }

  // perf-ignore
  getMatchColor(score: number): string {
    if (score >= 1) return '#096'; // Green
    if (score >= 0.7) return '#F9C835';
    if (score >= 0.5) return '#FF6900';
    return '#FB2C36'; // Red
  }

  // perf-ignore
  formatExp(years: number | undefined): string {
    if (years === undefined || years === 0 || years === null) return '—';
    return `${years} yr`;
  }

  // perf-ignore
  getStatusColorClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('strong') || s === 'met') return 'status-green';
    if (s.includes('partial')) return 'status-amber';
    return 'status-red';
  }

  getSkillProgress(category: 'mandatory' | 'preferred' | 'better'): number {
    let pool;
    if (category === 'mandatory') pool = this.mandatorySkills();
    else if (category === 'preferred') pool = this.preferredSkills();
    else pool = this.niceToHaveSkills();
    
    if (!pool || pool.length === 0) return 0;
    
    let score = 0;
    pool.forEach(s => { score += s.match_score; });
    return (score / pool.length) * 100;
  }

  openDisqualifiedModal() {
    this.isDisqualifiedModalOpen.set(true);
  }

  closeDisqualifiedModal() {
    this.isDisqualifiedModalOpen.set(false);
  }

  getFailedCategory(error: string | undefined): string {
    if (!error) return 'Invalid Document';
    const lower = error.toLowerCase();
    if (lower.includes('letter')) return 'Letter / Invitation Document';
    if (lower.includes('jd') || lower.includes('job description')) return 'Job Description File';
    if (lower.includes('certificate')) return 'Certificate Document';
    if (lower.includes('invoice') || lower.includes('bill')) return 'Billing / Financial File';
    if (lower.includes('format') || lower.includes('structure')) return 'Unstructured Document';
    return error.replace(/^invalid resume:\s*/i, '').trim() || 'Non-Resume Document';
  }

  getFailedCategoryClass(error: string | undefined): string {
    if (!error) return 'cat-generic';
    const lower = error.toLowerCase();
    if (lower.includes('letter')) return 'cat-letter';
    if (lower.includes('jd') || lower.includes('job description')) return 'cat-jd';
    if (lower.includes('certificate')) return 'cat-cert';
    return 'cat-generic';
  }
}
