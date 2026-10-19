import { CommonModule } from '@angular/common';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ToastService } from '@core/services/toast.service';
import { renderAsync } from 'docx-preview';
import { FileDropzoneComponent } from '../../components/file-dropzone/file-dropzone.component';
import { HrIconComponent } from '../../components/hr-icon/hr-icon.component';
import {
  DocumentContentIssues,
  DocumentFormatIssue,
  DocumentFormatIssueItem,
  DocumentInconsistencyItem,
  GrammaticalIssueItem,
  MiscellaneousIssueItem,
  MissingContentItem,
  VisaProcessResponse,
  VisaProcessService,
} from '../../hr-portal-services/visa-process.service';
import { HrPermissionService } from '../../hr-portal-services/hr-permission.service';

type ViewState = 'upload' | 'processing' | 'results';
type ProcessTab = 'business' | 'ict' | 'extension';
type ResultsCategoryTab = 'all' | 'format' | 'inconsistency' | 'missing' | 'grammar' | 'misc';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-visa-process',
  standalone: true,
  imports: [CommonModule, FormsModule, FileDropzoneComponent, HrIconComponent],
  templateUrl: './visa-process.component.html',
  styleUrls: ['./visa-process.component.scss'],
})
export class VisaProcessComponent implements OnInit, OnDestroy {
  private visaService = inject(VisaProcessService);
  private hrPermissionService = inject(HrPermissionService);
  private toastService = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  // Tab permissions
  readonly canAccessBusiness = computed(() => this.hrPermissionService.hasVisaAccess('business'));
  readonly canAccessIct = computed(() => this.hrPermissionService.hasVisaAccess('ict'));
  readonly canAccessExtension = computed(() => this.hrPermissionService.hasVisaAccess('extension'));
  readonly hasAnyVisaPermission = computed(() => this.canAccessBusiness() || this.canAccessIct() || this.canAccessExtension());

  // State
  viewState = signal<ViewState>('upload');
  activeProcessTab = signal<ProcessTab>('business');
  activeResultsCategory = signal<ResultsCategoryTab>('all');
  uploadProgress = signal(0);
  isUploading = signal(false);

  // Files
  resumeFile = signal<File | null>(null);
  resumeError = signal<string>('');

  indianLetterFile = signal<File | null>(null);
  indianLetterError = signal<string>('');

  canadaLetterFile = signal<File | null>(null);
  canadaLetterError = signal<string>('');

  // File Preview State
  previewFile = signal<File | null>(null);
  previewFileUrl = signal<string | null>(null);
  safePreviewUrl = signal<SafeResourceUrl | null>(null);
  previewTextContent = signal<string | null>(null);
  isRenderingDocx = signal(false);

  @ViewChild('docxContainer') set docxContainer(
    content: ElementRef<HTMLElement> | undefined,
  ) {
    if (
      content &&
      content.nativeElement &&
      this.previewFile() &&
      this.isPreviewDocx
    ) {
      this.renderDocxPreview(this.previewFile()!, content.nativeElement);
    }
  }

  // Parsed Analysis Results Signals
  emailId = signal<string>('');
  tokenUsed = signal<number | null>(null);
  responseProcessType = signal<string>('');
  profileType = signal<string>('');

  documentFormatIssues = signal<DocumentFormatIssue[]>([]);
  documentInconsistencies = signal<DocumentInconsistencyItem[]>([]);
  missingItems = signal<MissingContentItem[]>([]);
  grammaticalIssues = signal<GrammaticalIssueItem[]>([]);
  miscellaneousIssues = signal<MiscellaneousIssueItem[]>([]);

  // Expand/Collapse state for collapsible UI elements
  expandedSnippets = signal<Record<string, boolean>>({});
  expandedDescriptions = signal<Record<string, boolean>>({});

  // Computed Counts
  readonly totalFormatIssuesCount = computed(() =>
    this.documentFormatIssues().reduce((acc, doc) => acc + (doc.issues?.length || 0), 0)
  );
  readonly totalInconsistenciesCount = computed(() => this.documentInconsistencies().length);
  readonly totalMissingItemsCount = computed(() => this.missingItems().length);
  readonly totalGrammaticalCount = computed(() => this.grammaticalIssues().length);
  readonly totalMiscellaneousCount = computed(() => this.miscellaneousIssues().length);

  readonly totalContentIssuesCount = computed(
    () =>
      this.totalInconsistenciesCount() +
      this.totalMissingItemsCount() +
      this.totalGrammaticalCount() +
      this.totalMiscellaneousCount()
  );

  readonly totalIssuesCount = computed(
    () => this.totalFormatIssuesCount() + this.totalContentIssuesCount()
  );

  readonly hasAnyIssues = computed(() => this.totalIssuesCount() > 0);

  ngOnInit() {
    this.hrPermissionService.loadAccessControl().subscribe(() => {
      if (this.canAccessBusiness()) {
        this.selectProcessTab('business');
      } else if (this.canAccessIct()) {
        this.selectProcessTab('ict');
      } else if (this.canAccessExtension()) {
        this.selectProcessTab('extension');
      } else {
        this.activeProcessTab.set('' as any);
      }
    });
  }

  ngOnDestroy() {
    this.closeFilePreview();
  }

  get isPreviewImage(): boolean {
    const file = this.previewFile();
    return file ? file.type.startsWith('image/') : false;
  }

  get isPreviewPdf(): boolean {
    const file = this.previewFile();
    return file ? file.type === 'application/pdf' : false;
  }

  get isPreviewDocx(): boolean {
    const file = this.previewFile();
    if (!file) return false;
    const name = file.name.toLowerCase();
    return (
      name.endsWith('.docx') ||
      file.type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  }

  get isPreviewText(): boolean {
    const file = this.previewFile();
    if (!file) return false;
    return (
      file.type.startsWith('text/') ||
      /\.(txt|json|csv|xml|js|ts|html|css|py|java|cpp|md|sql)$/i.test(file.name)
    );
  }

  getFileExtension(filename: string): string {
    if (!filename) return '';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()!.toUpperCase() : '';
  }

  async renderDocxPreview(file: File, container: HTMLElement) {
    this.isRenderingDocx.set(true);
    try {
      container.innerHTML = '';
      const arrayBuffer = await file.arrayBuffer();
      await renderAsync(arrayBuffer, container, undefined, {
        className: 'docx-render',
        inWrapper: false,
        ignoreWidth: false,
        ignoreHeight: false,
        debug: false,
      });
    } catch (err) {
      console.warn('DOCX rendering encountered an issue:', err);
    } finally {
      this.isRenderingDocx.set(false);
    }
  }

  onPreviewLocalFile(file: File) {
    if (!file) return;

    this.closeFilePreview();
    this.previewFile.set(file);

    const fileType = file.type;

    if (fileType.startsWith('image/')) {
      this.previewFileUrl.set(window.URL.createObjectURL(file));
    } else if (fileType === 'application/pdf') {
      const url = window.URL.createObjectURL(file);
      this.previewFileUrl.set(url);
      this.safePreviewUrl.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(url),
      );
    } else if (this.isPreviewDocx) {
      this.previewFileUrl.set(window.URL.createObjectURL(file));
    } else if (
      fileType.startsWith('text/') ||
      /\.(txt|json|csv|xml|js|ts|html|css|py|java|cpp|md|sql)$/i.test(file.name)
    ) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.previewTextContent.set(e.target?.result as string);
      };
      reader.readAsText(file);
    } else {
      this.previewFileUrl.set(window.URL.createObjectURL(file));
    }
  }

  closeFilePreview() {
    const url = this.previewFileUrl();
    if (url && url.startsWith('blob:')) {
      window.URL.revokeObjectURL(url);
    }
    this.previewFile.set(null);
    this.previewFileUrl.set(null);
    this.safePreviewUrl.set(null);
    this.previewTextContent.set(null);
    this.isRenderingDocx.set(false);
  }

  selectProcessTab(tab: ProcessTab) {
    if (this.isUploading()) return;
    this.activeProcessTab.set(tab);

    // Clear files not needed for the newly selected process to keep state clean
    if (tab === 'ict') {
      this.canadaLetterFile.set(null);
      this.canadaLetterError.set('');
    } else if (tab === 'extension') {
      this.indianLetterFile.set(null);
      this.indianLetterError.set('');
    }
  }

  setResultsCategory(category: ResultsCategoryTab) {
    this.activeResultsCategory.set(category);
  }

  getProcessTitle(): string {
    switch (this.activeProcessTab()) {
      case 'business':
        return 'Business Letter';
      case 'ict':
        return 'ICT';
      case 'extension':
        return 'Work Extension';
    }
  }

  onResumeSelected(file: File | null) {
    this.resumeError.set('');
    if (!file) {
      this.resumeFile.set(null);
      return;
    }
    if (this.validateFile(file, this.resumeError)) {
      this.resumeFile.set(file);
    }
  }

  onIndianLetterSelected(file: File | null) {
    this.indianLetterError.set('');
    if (!file) {
      this.indianLetterFile.set(null);
      return;
    }
    if (this.validateFile(file, this.indianLetterError)) {
      this.indianLetterFile.set(file);
    }
  }

  onCanadaLetterSelected(file: File | null) {
    this.canadaLetterError.set('');
    if (!file) {
      this.canadaLetterFile.set(null);
      return;
    }
    if (this.validateFile(file, this.canadaLetterError)) {
      this.canadaLetterFile.set(file);
    }
  }

  private validateFile(file: File, errorSignal: any): boolean {
    const ext = (file.name || '').toLowerCase();

    // Explicitly restrict and reject deprecated .doc format
    if (ext.endsWith('.doc') && !ext.endsWith('.docx')) {
      errorSignal.set('Deprecated document format (.doc). Please use .docx or .pdf.');
      return false;
    }

    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (
      !allowed.includes(file.type) &&
      !ext.endsWith('.pdf') &&
      !ext.endsWith('.docx')
    ) {
      errorSignal.set('Please upload a PDF (.pdf) or Word (.docx) file.');
      return false;
    }

    if (file.size > 10 * 1024 * 1024) {
      errorSignal.set('File size must be under 10 MB.');
      return false;
    }

    return true;
  }

  // Check if we can submit based on selected process type
  canSubmit(): boolean {
    if (this.isUploading()) return false;
    if (!this.resumeFile() || this.resumeError()) return false;

    if (this.activeProcessTab() === 'business') {
      return (
        !!this.indianLetterFile() &&
        !this.indianLetterError() &&
        !!this.canadaLetterFile() &&
        !this.canadaLetterError()
      );
    } else if (this.activeProcessTab() === 'ict') {
      return !!this.indianLetterFile() && !this.indianLetterError();
    } else if (this.activeProcessTab() === 'extension') {
      return !!this.canadaLetterFile() && !this.canadaLetterError();
    }

    return false;
  }

  submitVisaDocs() {
    if (!this.canSubmit()) return;

    this.isUploading.set(true);
    this.uploadProgress.set(0);
    this.viewState.set('processing');

    const indFile =
      this.activeProcessTab() !== 'extension' ? this.indianLetterFile() : null;
    const canFile =
      this.activeProcessTab() !== 'ict' ? this.canadaLetterFile() : null;

    this.visaService
      .processVisa(
        this.activeProcessTab(),
        this.resumeFile()!,
        indFile,
        canFile,
      )
      .subscribe({
        next: (event: any) => {
          if (event.type === HttpEventType.UploadProgress) {
            const pct = event.total
              ? Math.round((100 * event.loaded) / event.total)
              : 0;
            this.uploadProgress.set(pct);
          } else if (event instanceof HttpResponse) {
            this.isUploading.set(false);
            const res = event.body as VisaProcessResponse;
            if (res && res.success) {
              this.emailId.set(res.email_id || '');
              this.tokenUsed.set(res.token_used ?? null);
              this.responseProcessType.set(res.type_of_visa_process || this.activeProcessTab());

              // 1. Document Format Issues
              const formatIssues: DocumentFormatIssue[] = Array.isArray(res.document_format_issues)
                ? res.document_format_issues
                : [];
              this.documentFormatIssues.set(formatIssues);

              // 2. Document Content Issues (also fallback to visa_process_status)
              const contentIssues: DocumentContentIssues =
                res.document_content_issues ||
                res.document_inconsistency ||
                (res.visa_process_status as DocumentContentIssues) ||
                {};

              const profType = contentIssues.profile_type || res.profile_type || '';
              this.profileType.set(profType);

              const inconsistencies = Array.isArray(contentIssues.document_inconsistency)
                ? contentIssues.document_inconsistency
                : [];
              this.documentInconsistencies.set(inconsistencies);

              const rawMissing = contentIssues.missing_items || [];
              const normalizedMissing: MissingContentItem[] = Array.isArray(rawMissing)
                ? rawMissing.map((item) => {
                    if (typeof item === 'string') {
                      return {
                        inconsistency: item,
                        present_in: [],
                        missing_from: [],
                      };
                    }
                    return item;
                  })
                : [];
              this.missingItems.set(normalizedMissing);

              const grammatical = Array.isArray(contentIssues.grammatical)
                ? contentIssues.grammatical
                : [];
              this.grammaticalIssues.set(grammatical);

              const misc = Array.isArray(contentIssues.miscellaneous)
                ? contentIssues.miscellaneous
                : [];
              this.miscellaneousIssues.set(misc);

              this.activeResultsCategory.set('all');
              this.viewState.set('results');
              this.toastService.show(
                'Analysis completed successfully!',
                'success',
                3000,
                'bottom-banner',
              );
            } else {
              this.handleError('Verification failed to return results.');
            }
          }
        },
        error: (err: any) => {
          console.error('Error in visa processing:', err);
          this.handleError(
            err?.error?.message || 'Error occurred during visa verification.',
          );
        },
      });
  }

  private handleError(msg: string) {
    this.isUploading.set(false);
    this.viewState.set('upload');
    this.toastService.show(msg, 'error', 4500, 'bottom-banner');
  }

  resetState() {
    this.viewState.set('upload');
    this.resumeFile.set(null);
    this.indianLetterFile.set(null);
    this.canadaLetterFile.set(null);
    this.resumeError.set('');
    this.indianLetterError.set('');
    this.canadaLetterError.set('');
    this.documentFormatIssues.set([]);
    this.documentInconsistencies.set([]);
    this.missingItems.set([]);
    this.grammaticalIssues.set([]);
    this.miscellaneousIssues.set([]);
    this.emailId.set('');
    this.tokenUsed.set(null);
    this.profileType.set('');
    this.uploadProgress.set(0);
    this.activeResultsCategory.set('all');
    this.expandedSnippets.set({});
    this.expandedDescriptions.set({});
  }

  formatIssueType(type: string): string {
    if (!type) return 'Formatting Issue';
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  getDetectedValue(issue: DocumentFormatIssueItem): string | number | null {
    if (issue.detected !== undefined && issue.detected !== null) return issue.detected;
    if (issue.detected_font_family) return issue.detected_font_family;
    if (issue.detected_font_size) return issue.detected_font_size;
    if (issue.detected_footer_font_family) return issue.detected_footer_font_family;
    if (issue.detected_alignment_issue) return issue.detected_alignment_issue;
    if (issue.detected_Paragraph_Spacing_issue) return issue.detected_Paragraph_Spacing_issue;
    return null;
  }

  getDocumentBadgeClass(docName: string): string {
    const lower = (docName || '').toLowerCase();
    if (lower.includes('india')) return 'doc-tag--india';
    if (lower.includes('canada')) return 'doc-tag--canada';
    if (lower.includes('resume') || lower.includes('profile')) return 'doc-tag--resume';
    return 'doc-tag--general';
  }

  // ── Enhanced UI Helpers ──────────────────────────────────────

  toggleSnippet(key: string) {
    this.expandedSnippets.update(state => ({ ...state, [key]: !state[key] }));
  }

  isSnippetExpanded(key: string): boolean {
    return !!this.expandedSnippets()[key];
  }

  toggleDescription(key: string) {
    this.expandedDescriptions.update(state => ({ ...state, [key]: !state[key] }));
  }

  isDescriptionExpanded(key: string): boolean {
    return !!this.expandedDescriptions()[key];
  }

  getExpectedValue(issue: DocumentFormatIssueItem): string | number | null {
    if (issue.expected_font_family) return issue.expected_font_family;
    if (issue.expected_font_size) return issue.expected_font_size;
    return null;
  }

  getIssueTypeBadgeClass(type: string): string {
    if (!type) return 'vp-issue-type--default';
    const lower = type.toLowerCase();
    if (lower.includes('font')) return 'vp-issue-type--font';
    if (lower.includes('alignment')) return 'vp-issue-type--alignment';
    if (lower.includes('spacing')) return 'vp-issue-type--spacing';
    return 'vp-issue-type--default';
  }
}
