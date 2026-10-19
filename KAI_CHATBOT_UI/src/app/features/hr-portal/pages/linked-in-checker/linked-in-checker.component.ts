import { CommonModule } from '@angular/common';
import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { HrIconComponent } from '../../components/hr-icon/hr-icon.component';
import { HrLoaderComponent } from '../../components/hr-loader/hr-loader.component';
import { API_RESPONSE_STATUS } from '../../constants/constant';
import { ErrorPageComponent } from '../../error-page/error-page.component';
import { LinkedInValidationService, TLinkedInState } from '../../hr-portal-services/linked-in-validation.service';
import { ConsistencyV2Data } from '@features/hr-portal/pages/linked-in-checker/linked-in-checker.model';
import { PopupService } from '../../hr-portal-services/popup.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-linked-in-checker',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ErrorPageComponent,
    HrLoaderComponent,
    HrIconComponent
  ],
  templateUrl: './linked-in-checker.component.html',
  styleUrl: './linked-in-checker.component.scss',
})
export class LinkedInCheckerComponent {
  private linkedInService = inject(LinkedInValidationService);
  private popupService = inject(PopupService);

  readonly apiResponse = API_RESPONSE_STATUS;

  // ── Signals ────────────────────────────────────────────────────────────────

  linkedInState = toSignal(this.linkedInService.linkedInValData$, {
    initialValue: { status: API_RESPONSE_STATUS.INITIAL, data: null } as TLinkedInState
  });

  errorMsg = computed(() => this.linkedInState().error);

  data = computed(() => {
    const raw = this.linkedInState().data;
    if (!raw) return null;

    // Support two common API wrapping formats
    if (raw?.data && raw.data.version === 'consistency_v2') return raw.data as ConsistencyV2Data;
    if (raw?.version === 'consistency_v2') return raw as ConsistencyV2Data;
    return raw as ConsistencyV2Data;
  });

  // ── Derived State (Computed) ───────────────────────────────────────────────

  overallScore = computed(() => this.data()?.consistency_assessment?.overall_consistency_score ?? 0);

  scorePercent = computed(() => Math.round(this.overallScore() * 100));

  scoreClass = computed(() => {
    const score = this.overallScore();
    const thresholds = this.data()?.ui_hints?.consistency_thresholds;
    if (!thresholds) return 'low';
    if (score >= thresholds.pass) return 'hi';
    if (score >= thresholds.warn) return 'mid';
    return 'lo';
  });

  scoreColor = computed(() => {
    const cls = this.scoreClass();
    return cls === 'hi' ? '#2d9e62' : cls === 'mid' ? '#e08530' : '#d14343';
  });

  scoreRingGradient = computed(() => {
    const deg = (this.scorePercent() / 100) * 360;
    const color = this.scoreColor();
    return `conic-gradient(${color} 0deg ${deg}deg, #eceae4 ${deg}deg 360deg)`;
  });

  discrepancies = computed(() => this.data()?.consistency_assessment?.discrepancies ?? []);

  highSeverityDiscrepancyCount = computed(() => {
    return this.discrepancies().filter(d => d.severity === 'high').length;
  });

  recommendations = computed(() => this.data()?.consistency_assessment?.recommendations ?? []);

  employmentChecks = computed(() => this.data()?.consistency_assessment?.checks?.employment?.details ?? []);

  skillChecks = computed(() => this.data()?.consistency_assessment?.checks?.skills ?? {
    missing_on_linkedin: [],
    missing_on_resume: [],
    consistency_score: 0,
    status: 'warn'
  });

  // ── Helper Methods ────────────────────────────────────────────────────────

  // perf-ignore
  formatLabel(val: string): string {
    if (!val) return '';
    return val.replace(/_/g, ' ');
  }

  // perf-ignore
  getSeverityClass(severity: string): string {
    return `sev-pill--${severity.toLowerCase()}`;
  }

  // perf-ignore
  getCheckStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'pass': return 'status-icon--pass';
      case 'warn': return 'status-icon--warn';
      case 'fail': return 'status-icon--fail';
      default: return 'status-icon--neutral';
    }
  }

  onRetry() {
    this.linkedInService.reset();
    this.popupService.setActivePopup('linkedin');
    this.popupService.openPopup();
  }
}
