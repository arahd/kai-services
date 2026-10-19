import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ToastService } from '@core/services/toast.service';
import { TourService } from '@core/services/tour.service';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';
import { ChatService } from '@features/chatbot/services/chat.service';
import { PrivacyPolicyComponent } from '../../pages/privacy-policy/privacy-policy.component';

interface RelatedFileEntry {
  id: string;
  file: File;
  preview: string | null;
  contentHash: string;
}

type AddFileResult = 'added' | 'rejected' | 'limit-reached';

function trimmedRequiredValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    return value ? null : { required: true };
  };
}

function trimmedMinLength(min: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) {
      return null;
    }
    if (value.length < min) {
      return {
        minlength: {
          requiredLength: min,
          actualLength: value.length,
        },
      };
    }
    return null;
  };
}

@Component({
  selector: 'app-help-menu',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ChatIconComponent,
    PrivacyPolicyComponent,
  ],
  templateUrl: './help-menu.component.html',
  styleUrls: ['./help-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpMenuComponent implements OnInit {
  private readonly maxAttachmentBytes = 3 * 1024 * 1024; // 3MB per image
  readonly maxAttachmentCount = 5;
  private readonly allowedImageExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.webp',
    '.svg',
  ];
  @Input() set models(val: Array<{
    value: string;
    label: string;
    description?: string;
    isDefault?: boolean;
  }>) {
    if (val && val.length > 0) {
      this._models = val;
    }
  }
  get models() {
    return this._models;
  }
  private _models: Array<{
    value: string;
    label: string;
    description?: string;
    isDefault?: boolean;
  }> = [
    { value: 'gpt-4o', label: 'GPT-4o', isDefault: true },
    { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ];
  @ViewChild('screenshotFileInput')
  screenshotFileInput?: ElementRef<HTMLInputElement>;
  isMenuOpen = false;
  showHelpCenterModal = false;
  showPrivacyPolicyModal = false;
  showReleaseNotesModal = false;
  showBugReportModal = false;
  isBugReportMinimized = false;
  isSubmittingBug = false;
  isBugSubmitted = false;
  bugSubmissionResponse: any = null;
  bugReportForm!: FormGroup;
  reportType: 'BUG_REPORT' | 'FEATURE_REQUEST' = 'BUG_REPORT';

  get isFeatureRequest(): boolean {
    return this.reportType === 'FEATURE_REQUEST';
  }

  relatedFiles: RelatedFileEntry[] = [];
  isScreenshotDragOver = false;
  private screenshotDragDepth = 0;

  private readonly USER_MANUAL_URL =
    'https://kumaran.sharepoint.com/:w:/r/sites/AI_KAI/Shared%20Documents/Project%20Updates/KAI_Chat_User_Manual.docx?d=wc4c8113bd88d4ba8a2be0989002ae02a&csf=1&web=1&e=n6b67l';
  @ViewChild('contactSection') contactSection!: ElementRef;

  releaseNotes = [
    {
      version: '1.0.0',
      date: 'May 07, 2026',
      changes: [
        'Added Help menu',
        'Added Azure bug reporting link',
        'Improved chatbot UI',
        'Added admin support contact details',
      ],
    },
  ];

  private elRef = inject(ElementRef);
  private tourService = inject(TourService);
  private fb = inject(FormBuilder);
  private chatService = inject(ChatService);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    this.initBugForm();
  }

  private initBugForm() {
    this.bugReportForm = this.fb.group({
      bug_name: ['', [trimmedRequiredValidator(), trimmedMinLength(5)]],
      category: ['UI/UX', Validators.required],
      severity: ['Low', Validators.required],
      description: ['', [trimmedRequiredValidator(), trimmedMinLength(30)]],
    });
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    this.cdr.markForCheck();
  }

  startWalkthrough() {
    this.isMenuOpen = false;
    this.cdr.markForCheck();
    this.tourService.startTour();
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    if (this.isMenuOpen && !this.elRef.nativeElement.contains(event.target)) {
      this.isMenuOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.isMenuOpen) {
      this.isMenuOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:paste', ['$event'])
  handlePaste(event: ClipboardEvent) {
    if (!this.canAcceptBugAttachments()) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          void this.addRelatedFiles([file]);
          break;
        }
      }
    }
  }

  private canAcceptBugAttachments(): boolean {
    return (
      this.showBugReportModal &&
      !this.isBugReportMinimized &&
      !this.isBugSubmitted &&
      this.relatedFiles.length < this.maxAttachmentCount
    );
  }

  onScreenshotDragEnter(event: DragEvent): void {
    if (!this.canAcceptBugAttachments()) return;

    event.preventDefault();
    event.stopPropagation();
    this.screenshotDragDepth++;
    this.isScreenshotDragOver = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.cdr.markForCheck();
  }

  onScreenshotDragOver(event: DragEvent): void {
    if (!this.canAcceptBugAttachments()) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onScreenshotDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.screenshotDragDepth = Math.max(0, this.screenshotDragDepth - 1);
    if (this.screenshotDragDepth === 0) {
      this.isScreenshotDragOver = false;
      this.cdr.markForCheck();
    }
  }

  async onScreenshotDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.screenshotDragDepth = 0;
    this.isScreenshotDragOver = false;

    if (!this.canAcceptBugAttachments()) {
      this.cdr.markForCheck();
      return;
    }

    const files = event.dataTransfer?.files;
    if (!files?.length) {
      this.cdr.markForCheck();
      return;
    }

    await this.addRelatedFiles(Array.from(files));
  }

  private getImageExtension(fileName: string): string | null {
    const lower = fileName.toLowerCase().trim();
    const lastDot = lower.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === lower.length - 1) {
      return null;
    }
    return lower.slice(lastDot);
  }

  private hasSuspiciousDoubleExtension(fileName: string): boolean {
    const lower = fileName.toLowerCase().trim();
    const lastDot = lower.lastIndexOf('.');
    if (lastDot <= 0) {
      return true;
    }

    const baseName = lower.slice(0, lastDot);
    return baseName.includes('.');
  }

  private isAllowedImage(file: File): boolean {
    const fileName = file.name?.trim() ?? '';
    if (!fileName || this.hasSuspiciousDoubleExtension(fileName)) {
      return false;
    }

    if (file.type?.startsWith('image/')) {
      return true;
    }

    const extension = this.getImageExtension(fileName);
    return !!extension && this.allowedImageExtensions.includes(extension);
  }

  private async computeFileHash(file: File): Promise<string> {
    try {
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback fingerprint if hashing is unavailable (e.g. non-secure context)
      return `${file.name}:${file.size}:${file.lastModified}`;
    }
  }

  private async addRelatedFile(file: File): Promise<AddFileResult> {
    if (this.relatedFiles.length >= this.maxAttachmentCount) {
      this.toastService.show(
        `You can attach up to ${this.maxAttachmentCount} images per bug report.`,
        'error',
      );
      return 'limit-reached';
    }

    if (!this.isAllowedImage(file)) {
      const message = this.hasSuspiciousDoubleExtension(file.name ?? '')
        ? 'Files with multiple extensions (e.g. image.docx.png) are not allowed.'
        : 'Only image files are allowed (JPG, PNG, GIF, BMP, WEBP, SVG).';
      this.toastService.show(message, 'error');
      return 'rejected';
    }

    if (file.size > this.maxAttachmentBytes) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      this.toastService.show(
        `"${file.name}" is ${sizeMb}MB. Each image must be 3MB or smaller.`,
        'error',
      );
      return 'rejected';
    }

    const contentHash = await this.computeFileHash(file);
    if (this.relatedFiles.some((entry) => entry.contentHash === contentHash)) {
      this.toastService.show(
        `"${file.name}" is already attached. Duplicate images are not allowed.`,
        'error',
      );
      return 'rejected';
    }

    const entry: RelatedFileEntry = {
      id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}`,
      file,
      preview: null,
      contentHash,
    };
    this.relatedFiles = [...this.relatedFiles, entry];

    const reader = new FileReader();
    reader.onload = (e) => {
      entry.preview = e.target?.result as string;
      this.relatedFiles = [...this.relatedFiles];
      this.cdr.markForCheck();
    };
    reader.onerror = () => {
      this.relatedFiles = this.relatedFiles.filter(
        (item) => item.id !== entry.id,
      );
      this.toastService.show(`Failed to preview ${file.name}`, 'error');
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
    return 'added';
  }

  openHelpCenter() {
    this.isMenuOpen = false;
    this.showHelpCenterModal = true;
    this.cdr.markForCheck();
  }

  scrollToContact() {
    if (this.contactSection) {
      this.contactSection.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }

  closeHelpCenter() {
    this.showHelpCenterModal = false;
    this.cdr.markForCheck();
  }

  openPrivacyPolicy() {
    this.isMenuOpen = false;
    this.showPrivacyPolicyModal = true;
    this.cdr.markForCheck();
  }

  closePrivacyPolicy() {
    this.showPrivacyPolicyModal = false;
    this.cdr.markForCheck();
  }

  openUserManual() {
    this.isMenuOpen = false;
    window.open(this.USER_MANUAL_URL, '_blank');
  }

  openReleaseNotes() {
    this.isMenuOpen = false;
    this.showReleaseNotesModal = true;
    this.cdr.markForCheck();
  }

  closeReleaseNotes() {
    this.showReleaseNotesModal = false;
    this.cdr.markForCheck();
  }

  raiseBug() {
    this.isMenuOpen = false;

    if (this.showBugReportModal && this.reportType !== 'BUG_REPORT') {
      if (this.hasUnsavedBugDraft()) {
        const shouldDiscard = window.confirm(
          'Unsaved changes will be lost. Do you want to continue?',
        );
        if (!shouldDiscard) {
          this.isBugReportMinimized = false;
          this.cdr.markForCheck();
          return;
        }
      }
      this.reportType = 'BUG_REPORT';
      this.openFreshBugReport();
      return;
    }

    this.reportType = 'BUG_REPORT';

    if (this.isBugSubmitted) {
      this.openFreshBugReport();
      return;
    }

    if (this.hasUnsavedBugDraft()) {
      const shouldDiscard = window.confirm(
        'Unsaved changes will be lost. Do you want to continue?',
      );
      if (!shouldDiscard) {
        this.showBugReportModal = true;
        this.isBugReportMinimized = false;
        this.cdr.markForCheck();
        return;
      }

      this.openFreshBugReport();
      return;
    }

    if (this.showBugReportModal) {
      this.isBugReportMinimized = false;
      this.cdr.markForCheck();
      return;
    }

    this.openFreshBugReport();
  }

  raiseFeatureRequest() {
    this.isMenuOpen = false;

    if (this.showBugReportModal && this.reportType !== 'FEATURE_REQUEST') {
      if (this.hasUnsavedBugDraft()) {
        const shouldDiscard = window.confirm(
          'Unsaved changes will be lost. Do you want to continue?',
        );
        if (!shouldDiscard) {
          this.isBugReportMinimized = false;
          this.cdr.markForCheck();
          return;
        }
      }
      this.reportType = 'FEATURE_REQUEST';
      this.openFreshBugReport();
      return;
    }

    this.reportType = 'FEATURE_REQUEST';

    if (this.isBugSubmitted) {
      this.openFreshBugReport();
      return;
    }

    if (this.hasUnsavedBugDraft()) {
      const shouldDiscard = window.confirm(
        'Unsaved changes will be lost. Do you want to continue?',
      );
      if (!shouldDiscard) {
        this.showBugReportModal = true;
        this.isBugReportMinimized = false;
        this.cdr.markForCheck();
        return;
      }

      this.openFreshBugReport();
      return;
    }

    if (this.showBugReportModal) {
      this.isBugReportMinimized = false;
      this.cdr.markForCheck();
      return;
    }

    this.openFreshBugReport();
  }

  private openFreshBugReport(): void {
    this.showBugReportModal = true;
    this.isBugReportMinimized = false;
    this.relatedFiles = [];
    this.bugReportForm.reset({
      category: 'UI/UX',
      severity: 'Low',
    });
    this.bugReportForm.markAsPristine();
    this.bugReportForm.markAsUntouched();
    this.isBugSubmitted = false;
    this.bugSubmissionResponse = null;
    this.cdr.markForCheck();
  }

  private hasUnsavedBugDraft(): boolean {
    if (this.isBugSubmitted) {
      return false;
    }

    // perf-ignore
    const bugName = String(
      this.bugReportForm?.get('bug_name')?.value ?? '',
    ).trim();
    const description = String(
      this.bugReportForm?.get('description')?.value ?? '',
    ).trim();

    return (
      bugName.length > 0 ||
      description.length > 0 ||
      this.relatedFiles.length > 0
    );
  }

  openScreenshotFilePicker(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.screenshotFileInput?.nativeElement.click();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files ?? []);
    if (!selectedFiles.length) {
      return;
    }

    void this.addRelatedFiles(selectedFiles).finally(() => {
      input.value = '';
      this.cdr.markForCheck();
    });
  }

  private async addRelatedFiles(files: File[]): Promise<void> {
    for (const file of files) {
      const result = await this.addRelatedFile(file);
      if (result === 'limit-reached') {
        break;
      }
    }
    this.cdr.markForCheck();
  }

  removeRelatedFile(index: number, event: Event) {
    event.stopPropagation();
    this.relatedFiles = this.relatedFiles.filter((_, i) => i !== index);
    this.cdr.markForCheck();
  }

  submitBug() {
    if (!this.bugReportForm.valid) {
      this.markFormGroupTouched(this.bugReportForm);
      return;
    }

    const bugName = String(this.bugReportForm.value.bug_name ?? '').trim();
    const description = String(
      this.bugReportForm.value.description ?? '',
    ).trim();

    if (bugName.length < 5 || description.length < 30) {
      this.markFormGroupTouched(this.bugReportForm);
      return;
    }

    this.isSubmittingBug = true;
    this.cdr.markForCheck();

    const formData = new FormData();
    formData.append('request_type', this.reportType);
    formData.append('bug_name', bugName);
    formData.append('description', description);
    this.relatedFiles
      .filter((entry) => this.isAllowedImage(entry.file))
      .forEach((entry) => {
        formData.append(
          'related_files',
          entry.file,
          entry.file.name || 'attachment',
        );
      });

    this.chatService.createBugReport(formData).subscribe({
      // perf-ignore
      next: (res) => {
        this.isSubmittingBug = false;
        this.isBugSubmitted = true;
        this.bugSubmissionResponse = res;
        this.relatedFiles = [];
        this.bugReportForm.reset({
          category: 'UI/UX',
          severity: 'Low',
        });
        const msg = this.isFeatureRequest
          ? 'Feature request submitted successfully!'
          : 'Bug report submitted successfully!';
        this.toastService.show(msg, 'success');
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error submitting report:', err);
        this.isSubmittingBug = false;
        const errMsg = this.isFeatureRequest
          ? 'Failed to submit feature request. Please try again.'
          : 'Failed to submit bug report. Please try again.';
        this.toastService.show(errMsg, 'error');
        this.cdr.markForCheck();
      },
    });
  }

  submitFeatureRequest() {
    this.submitBug();
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach((control) => {
      control.markAsTouched();
      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }

  minimizeBugReport() {
    this.isBugReportMinimized = true;
    this.cdr.markForCheck();
  }

  restoreBugReport() {
    this.isBugReportMinimized = false;
    this.cdr.markForCheck();
  }

  closeBugReport() {
    if (this.hasUnsavedBugDraft()) {
      const shouldDiscard = window.confirm(
        'Unsaved changes will be lost. Do you want to continue?',
      );
      if (!shouldDiscard) {
        return;
      }
    }

    this.resetBugReportState();
  }

  private resetBugReportState(): void {
    this.showBugReportModal = false;
    this.isBugReportMinimized = false;
    this.isBugSubmitted = false;
    this.bugSubmissionResponse = null;
    this.relatedFiles = [];
    this.isScreenshotDragOver = false;
    this.screenshotDragDepth = 0;
    this.reportType = 'BUG_REPORT';
    this.bugReportForm.reset({
      category: 'UI/UX',
      severity: 'Low',
    });
    this.cdr.markForCheck();
  }

  copyTicketNumber() {
    if (this.bugSubmissionResponse?.ticket_number) {
      navigator.clipboard
        .writeText(this.bugSubmissionResponse.ticket_number)
        .then(() => {
          this.toastService.show(
            'Ticket number copied to clipboard!',
            'success',
          );
        });
    }
  }

  contactTeams() {
    const adminEmail = 'karthikeyan.subbaroyan@kumaran.com';
    const message = 'Hi Karthikeyan, I need help with KAI Chatbot.';
    const webUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(adminEmail)}&message=${encodeURIComponent(message)}`;
    window.open(webUrl, '_blank');
  }

  contactOutlook() {
    const adminEmail = 'karthikeyan.subbaroyan@kumaran.com';
    const subject = 'KAI Chatbot Support Request';
    const message = 'Hi Karthikeyan, I need help with KAI Chatbot.';
    const mailtoUrl = `mailto:${encodeURIComponent(adminEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.location.href = mailtoUrl;
  }

  /** Returns a user-friendly summary for the Help Center model card */
  // perf-ignore
  getModelSummary(modelValue: string): string {
    const v = (modelValue || '').toLowerCase();

    if (v.includes('opus'))
      return 'Our most powerful model for complex analysis and high-quality creative work.';
    if (v.includes('sonnet'))
      return 'A balanced model providing speed and intelligence for most daily tasks.';
    if (v.includes('4o-mini') || v.includes('4o'))
      return 'Best for simple tasks and rapid answers without complex reasoning.';
    if (v.includes('5-mini') || v.includes('5'))
      return 'The next-generation lightweight model for reliable and fast interactions.';
    if (v.includes('claude'))
      return "Anthropic's Claude model for thoughtful, nuanced responses.";
    if (v.includes('gpt'))
      return "OpenAI's GPT model for versatile, general-purpose conversations.";

    return 'An AI model available for your conversations.';
  }
}
