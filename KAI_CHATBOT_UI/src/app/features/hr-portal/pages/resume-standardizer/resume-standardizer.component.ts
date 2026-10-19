import { CommonModule } from '@angular/common';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FileDropzoneComponent } from '../../components/file-dropzone/file-dropzone.component';

import { ToastService } from '@core/services/toast.service';
import { FileDownloadService } from '@shared/services/file-download.service';
import {
  ResumeGenerateResponse,
  ResumeStandardizerService,
} from '../../hr-portal-services/resume-standardizer.service';

export interface AnalysisDetail {
  heading: string;
  description: string;
  value?: string | string[] | AnalysisDetail[];
  valueType?: 'string' | 'array' | 'object' | 'link';
}

type ViewState = 'upload' | 'processing' | 'results';
type ResultTab = 'missing' | 'additional';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-resume-standardizer',
  standalone: true,
  imports: [CommonModule, FormsModule, FileDropzoneComponent],
  templateUrl: './resume-standardizer.component.html',
  styleUrls: ['./resume-standardizer.component.scss'],
})
export class ResumeStandardizerComponent implements OnInit, OnDestroy {
  private resumeService = inject(ResumeStandardizerService);
  private fileDownloadService = inject(FileDownloadService);
  private toastService = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  // ── State ───────────────────────────────────────────────────────────────
  viewState = signal<ViewState>('upload');
  activeTab = signal<ResultTab>('missing');

  // Upload
  resumeFile: File | null = null;
  resumeError = '';
  templateFile: File | null = null;
  templateError = '';
  uploadProgress = signal(0);
  isUploading = signal(false);

  // Results
  blobPath = '';
  blobPathPdf = '';
  blobPathDocx = '';
  pdfBlobUrl: string | null = null;
  safePdfUrl: SafeResourceUrl | null = null;
  pdfFileName = 'Resume.pdf';
  docxFileName = 'Resume.docx';
  isDownloading = signal(false);
  isDownloadingPdf = signal(false);
  isDownloadingDocx = signal(false);
  isFullscreen = signal(false);
  downloadDropdownOpen = signal(false);

  // File Preview Modal state
  previewFile: any | null = null;
  previewFileUrl: string | null = null;
  safePreviewUrl: SafeResourceUrl | null = null;
  previewTextContent: string | null = null;

  get isPreviewImage(): boolean {
    if (!this.previewFile) return false;
    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(
      this.previewFile.name || '',
    );
  }

  get isPreviewPdf(): boolean {
    if (!this.previewFile) return false;
    return /\.pdf$/i.test(this.previewFile.name || '');
  }

  get isPreviewText(): boolean {
    if (!this.previewFile) return false;
    return /\.(txt|json|csv|xml|js|ts|html|css|py|java|cpp|md|sql)$/i.test(
      this.previewFile.name || '',
    );
  }

  // perf-ignore
  getFileExtension(name: string): string {
    return (name || '').split('.').pop()?.toUpperCase() || '';
  }

  // Page navigation in the PDF preview
  currentPage = signal(1);
  totalPages = signal(6);

  // Analysis results
  analysisStatus = signal<'matches' | 'issues'>('matches');
  missingDetails: AnalysisDetail[] = [];
  extraDetails: AnalysisDetail[] = [];

  ngOnInit() {}

  /**
   * Converts a snake_case API key like "missing_education_percentage"
   * into a readable heading like "Education Percentage".
   */
  private formatDetailKey(key: string): string {
    return key
      .replace(/^(missing_|extra_)/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Helper to check if a value or nested structure is empty
   * (e.g. null, undefined, "", "—", "none", empty array [], empty object {}, or object with only empty values).
   */
  private isEmptyValue(val: any): boolean {
    if (val == null) return true;

    if (typeof val === 'string') {
      const trimmed = val.trim();
      return (
        trimmed === '' ||
        trimmed === '—' ||
        trimmed.toLowerCase() === 'none' ||
        trimmed.toLowerCase() === 'n/a' ||
        trimmed.toLowerCase() === 'null' ||
        trimmed.toLowerCase() === 'undefined'
      );
    }

    if (typeof val === 'number' || typeof val === 'boolean') {
      return false;
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return true;
      return val.every((item) => this.isEmptyValue(item));
    }

    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return true;
      return keys.every((k) => this.isEmptyValue(val[k]));
    }

    return false;
  }

  /**
   * Parse a Record<string, string> from the API into an array of AnalysisDetail,
   * skipping any empty or null entries.
   */
  private parseDetails(
    details: Record<string, string> | undefined,
  ): AnalysisDetail[] {
    if (!details) return [];
    return Object.entries(details)
      .filter(([_, value]) => !this.isEmptyValue(value))
      .map(([key, value]) => ({
        heading: this.formatDetailKey(key),
        description: String(value),
      }));
  }

  private parseExtraDetails(
    details: Record<string, any> | undefined,
  ): AnalysisDetail[] {
    if (!details) return [];
    return Object.entries(details)
      .filter(([_, value]) => !this.isEmptyValue(value))
      .map(([key, value]) => this.parseExtraValue(key, value))
      .filter((item): item is AnalysisDetail => !!item);
  }

  private parseExtraValue(key: string, value: any): AnalysisDetail | null {
    if (this.isEmptyValue(value)) return null;

    const heading = this.formatDetailKey(key);

    // string
    if (typeof value === 'string') {
      const isLink = /^https?:\/\//i.test(value);
      return {
        heading,
        description: value,
        value,
        valueType: isLink ? 'link' : 'string',
      };
    }

    // number / boolean
    if (typeof value === 'number' || typeof value === 'boolean') {
      return {
        heading,
        description: String(value),
        value: String(value),
        valueType: 'string',
      };
    }

    // array
    if (Array.isArray(value)) {
      const nonEmptyItems = value.filter((item) => !this.isEmptyValue(item));
      if (nonEmptyItems.length === 0) {
        return null;
      }
      const allPrimitive = nonEmptyItems.every(
        (v) =>
          typeof v === 'string' ||
          typeof v === 'number' ||
          typeof v === 'boolean',
      );
      if (allPrimitive) {
        return {
          heading,
          description: '',
          value: nonEmptyItems.map(String),
          valueType: 'array',
        };
      }
      // array of objects / mixed
      const children = nonEmptyItems
        .map((item, idx) => {
          if (item != null && typeof item === 'object' && !Array.isArray(item)) {
            const childEntries = Object.entries(item)
              .filter(([_, v]) => !this.isEmptyValue(v))
              .map(([k, v]) => this.parseExtraValue(k, v))
              .filter((x): x is AnalysisDetail => !!x);

            if (childEntries.length === 0) return null;

            return {
              heading: `${heading} #${idx + 1}`,
              description: '',
              value: childEntries,
              valueType: 'object' as const,
            };
          }
          return this.parseExtraValue(`${heading} #${idx + 1}`, item);
        })
        .filter((x): x is AnalysisDetail => !!x);

      if (children.length === 0) return null;

      return {
        heading,
        description: '',
        value: children,
        valueType: 'object',
      };
    }

    // object (Record<string, any>)
    if (typeof value === 'object') {
      const children = Object.entries(value)
        .filter(([_, v]) => !this.isEmptyValue(v))
        .map(([k, v]) => this.parseExtraValue(k, v))
        .filter((x): x is AnalysisDetail => !!x);

      if (children.length === 0) return null;

      return {
        heading,
        description: '',
        value: children,
        valueType: 'object',
      };
    }

    // fallback
    return { heading, description: String(value), valueType: 'string' };
  }

  // ── File Selection ──────────────────────────────────────────────────────

  onResumeSelected(file: File | null) {
    this.resumeError = '';
    if (!file) {
      this.resumeFile = null;
      return;
    }

    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const ext = (file.name || '').toLowerCase();
    if (
      !allowed.includes(file.type) &&
      !ext.endsWith('.pdf') &&
      !ext.endsWith('.docx')
    ) {
      this.resumeError = 'Please upload a PDF or DOCX file.';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.resumeError = 'File size must be under 10 MB.';
      return;
    }

    this.resumeFile = file;
  }

  onTemplateSelected(file: File | null) {
    this.templateError = '';
    if (!file) {
      this.templateFile = null;
      return;
    }

    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const ext = (file.name || '').toLowerCase();
    if (
      !allowed.includes(file.type) &&
      !ext.endsWith('.pdf') &&
      !ext.endsWith('.docx')
    ) {
      this.templateError = 'Please upload a PDF or DOCX file.';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.templateError = 'File size must be under 10 MB.';
      return;
    }

    this.templateFile = file;
  }

  removeResume() {
    this.resumeFile = null;
    this.resumeError = '';
  }

  removeTemplate() {
    this.templateFile = null;
    this.templateError = '';
  }

  onPreviewLocalFile(file: File) {
    if (!file) return;

    this.previewFile = file;
    this.previewFileUrl = null;
    this.safePreviewUrl = null;
    this.previewTextContent = null;

    const fileType = file.type;

    if (fileType.startsWith('image/')) {
      this.previewFileUrl = window.URL.createObjectURL(file);
    } else if (fileType === 'application/pdf') {
      const url = window.URL.createObjectURL(file);
      this.previewFileUrl = url;
      this.safePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    } else if (
      fileType.startsWith('text/') ||
      /\.(txt|json|csv|xml|js|ts|html|css|py|java|cpp|md|sql)$/i.test(file.name)
    ) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.previewTextContent = e.target?.result as string;
      };
      reader.readAsText(file);
    } else {
      this.previewFileUrl = window.URL.createObjectURL(file);
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

  // ── Submit ──────────────────────────────────────────────────────────────

  submitResume() {
    if (!this.resumeFile) {
      this.resumeError = 'Please select a resume file.';
      return;
    }
    /*
    if (!this.templateFile) {
      this.templateError = 'Please select a template file.';
      return;
    }
    */

    this.isUploading.set(true);
    this.uploadProgress.set(0);
    this.viewState.set('processing');

    this.resumeService.generateResume(this.resumeFile).subscribe({
      // perf-ignore
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          const pct = Math.round((event.loaded / event.total) * 100);
          this.uploadProgress.set(pct);
        } else if (event.type === HttpEventType.Response) {
          const body = (event as HttpResponse<ResumeGenerateResponse>).body;
          const pdfPath = body?.blob_path_pdf || body?.blob_path || '';
          const docxPath = body?.blob_path_docx || '';

          if (body?.success && (pdfPath || docxPath)) {
            this.blobPath = pdfPath || docxPath;
            this.blobPathPdf = pdfPath;
            this.blobPathDocx = docxPath;

            const baseName =
              this.resumeFile?.name?.replace(/\.\w+$/, '') || 'Resume';
            this.pdfFileName = `${baseName}_standardized.pdf`;
            this.docxFileName = `${baseName}_standardized.docx`;

            this.missingDetails = this.parseDetails(body.missing_details);
            this.extraDetails = this.parseExtraDetails(body.extra_details);

            if (pdfPath) {
              this.loadPdfPreview(pdfPath);
            } else {
              this.viewState.set('results');
              this.isUploading.set(false);
              const hasIssues =
                this.missingDetails.length > 0 || this.extraDetails.length > 0;
              this.analysisStatus.set(hasIssues ? 'issues' : 'matches');
            }
          } else {
            this.handleError('Resume generation failed. Please try again.');
          }
        }
      },
      error: (err) => {
        console.error('Resume generation error:', err);
        this.handleError(
          err?.error?.message ||
            'An error occurred while generating the resume. Please try again.',
        );
      },
    });
  }

  // ── PDF Preview ─────────────────────────────────────────────────────────

  private loadPdfPreview(blobKey: string) {
    this.resumeService.downloadResume(blobKey).subscribe({
      // perf-ignore
      next: (response: any) => {
        const blob: Blob = response.body;
        if (blob) {
          this.pdfBlobUrl = window.URL.createObjectURL(blob);
          this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
            this.pdfBlobUrl,
          );
          this.viewState.set('results');
          this.isUploading.set(false);
          const hasIssues =
            this.missingDetails.length > 0 || this.extraDetails.length > 0;
          this.analysisStatus.set(hasIssues ? 'issues' : 'matches');
        } else {
          this.handleError('Could not load the generated resume.');
        }
      },
      error: (err) => {
        console.error('PDF download error:', err);
        this.handleError('Failed to download the generated resume.');
      },
    });
  }

  // ── Download ────────────────────────────────────────────────────────────

  toggleDownloadDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.downloadDropdownOpen.update((v) => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.rs-download-dropdown')) {
      this.downloadDropdownOpen.set(false);
    }
  }

  downloadPdf() {
    const key = this.blobPathPdf || this.blobPath;
    if (!key) return;
    this.downloadFile(key, this.pdfFileName, this.isDownloadingPdf);
  }

  downloadDocx() {
    if (!this.blobPathDocx) return;
    this.downloadFile(this.blobPathDocx, this.docxFileName, this.isDownloadingDocx);
  }

  private downloadFile(
    blobKey: string,
    fileName: string,
    loadingSignal: WritableSignal<boolean>,
  ) {
    loadingSignal.set(true);
    this.resumeService.downloadResume(blobKey).subscribe({
      // perf-ignore
      next: (response: any) => {
        this.fileDownloadService.downloadFile(
          response as HttpResponse<Blob>,
          fileName,
        );
        loadingSignal.set(true);
        setTimeout(() => loadingSignal.set(false), 200);
      },
      error: async (err) => {
        console.error('Download failed:', err);
        const apiError = await this.fileDownloadService.parseBlobError(err);
        const msg =
          apiError?.message || 'Unable to download resume. Please try again.';
        this.toastService.show(msg, 'error');
        loadingSignal.set(false);
      },
    });
  }

  // ── Fullscreen ──────────────────────────────────────────────────────────

  toggleFullscreen() {
    this.isFullscreen.update((v) => !v);
  }

  // ── Tab switching ───────────────────────────────────────────────────────

  setTab(tab: ResultTab) {
    this.activeTab.set(tab);
  }

  // ── Reset / Start Over ─────────────────────────────────────────────────

  startOver() {
    this.cleanupBlobUrl();
    this.resumeFile = null;
    this.resumeError = '';
    this.templateFile = null;
    this.templateError = '';
    this.blobPath = '';
    this.blobPathPdf = '';
    this.blobPathDocx = '';
    this.pdfBlobUrl = null;
    this.safePdfUrl = null;
    this.missingDetails = [];
    this.extraDetails = [];
    this.uploadProgress.set(0);
    this.isUploading.set(false);
    this.isDownloadingPdf.set(false);
    this.isDownloadingDocx.set(false);
    this.downloadDropdownOpen.set(false);
    this.viewState.set('upload');
  }

  // ── Error handling ──────────────────────────────────────────────────────

  private handleError(msg: string) {
    this.toastService.show(msg, 'error');
    this.isUploading.set(false);
    this.viewState.set('upload');
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  getFileSize(size: number): string {
    if (size === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /** Template helper: cast value to string[] for array-type details */
  asStringArray(value: any): string[] {
    return Array.isArray(value) ? value : [];
  }

  /** Template helper: cast value to AnalysisDetail[] for object-type details */
  asDetailArray(value: any): AnalysisDetail[] {
    return Array.isArray(value) ? value : [];
  }

  /** Template helper: check if a string is a URL */
  isUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private cleanupBlobUrl() {
    if (this.pdfBlobUrl) {
      window.URL.revokeObjectURL(this.pdfBlobUrl);
    }
    this.closeFilePreview();
  }

  ngOnDestroy() {
    this.cleanupBlobUrl();
  }
}
