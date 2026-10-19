import { Component, Input, Output, EventEmitter, inject, OnChanges, SimpleChanges, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';
import { FileExtensionPipe } from '@shared/pipes/file-extension.pipe';

import { AttachmentService } from '@features/chatbot/services/attachment.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { FileUtils } from '@shared/utils/file.utils';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-file-preview-modal',
  standalone: true,
  imports: [CommonModule, ChatIconComponent, FileExtensionPipe],
  templateUrl: './file-preview-modal.component.html',
  styleUrls: ['./file-preview-modal.component.scss'],
})
export class FilePreviewModalComponent implements OnChanges, OnDestroy {
  @Input() file: any | null = null;
  @Output() readonly close = new EventEmitter<void>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly attachmentService = inject(AttachmentService);
  private readonly storageService = inject(SessionStorageService);

  previewFileUrl: string | null = null;
  safePreviewUrl: SafeResourceUrl | null = null;
  previewTextContent: string | null = null;
  isLoading = false;

  get isPreviewImage(): boolean {
    if (!this.file) return false;
    return this.file.isImage || /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(this.file.name || '');
  }

  get isPreviewPdf(): boolean {
    if (!this.file) return false;
    return /\.pdf$/i.test(this.file.name || '');
  }

  get isPreviewText(): boolean {
    if (!this.file) return false;
    return /\.(txt|json|csv|xml|js|ts|html|css|py|java|cpp|md|sql)$/i.test(this.file.name || '');
  }

  getFileExtension(name: string): string {
    return (name || '').split('.').pop()?.toUpperCase() || '';
  }

  getFileIconName(name: string): string {
    return FileUtils.getFileIconName(name);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['file'] && this.file) {
      this.resetPreviewState();
      this.initializePreview();
    }
  }

  private resetPreviewState() {
    this.cleanUpUrls();
    this.previewFileUrl = null;
    this.safePreviewUrl = null;
    this.previewTextContent = null;
    this.isLoading = false;
  }

  private initializePreview() {
    const fp = this.file;
    if (!fp) return;

    if (fp.file instanceof File) {
      const fileType = fp.file.type;

      if (fileType.startsWith('image/')) {
        this.previewFileUrl = fp.previewUrl || window.URL.createObjectURL(fp.file);
      } else if (fileType === 'application/pdf') {
        const url = window.URL.createObjectURL(fp.file);
        this.previewFileUrl = url;
        this.safePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      } else if (
        fileType.startsWith('text/') ||
        /\.(txt|json|csv|xml|js|ts|html|css|py|java|cpp|md|sql)$/i.test(fp.name)
      ) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.previewTextContent = e.target?.result as string;
          this.cdr.markForCheck();
        };
        reader.readAsText(fp.file);
      } else {
        this.previewFileUrl = window.URL.createObjectURL(fp.file);
      }
      this.cdr.markForCheck();
    } else if (fp.content || fp.data || fp.document_data) {
      const rawText = fp.content || fp.data || fp.document_data;
      if (typeof rawText === 'string') {
        this.previewTextContent = rawText;
      }
      this.cdr.markForCheck();
    } else if (fp.previewUrl) {
      this.previewFileUrl = fp.previewUrl;
      this.safePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(fp.previewUrl);
      this.cdr.markForCheck();
    } else if (fp.name) {
      // Fallback: previewUrl is not yet populated. Fetch document on-demand immediately.
      const convId = fp.conversationId || this.storageService.getConversationId() || this.storageService.getLastActiveConversationId();
      if (convId) {
        this.isLoading = true;
        this.cdr.markForCheck();

        this.attachmentService.fetchUploadedDocument(convId).subscribe({
          next: (res: any) => {
            this.isLoading = false;
            if (res && Array.isArray(res.documents) && res.documents.length > 0) {
              const matched = res.documents.find((d: any) => {
                const dName = d.filename || d.document_name || '';
                return dName === fp.name || dName.toLowerCase().includes(fp.name.toLowerCase()) || fp.name.toLowerCase().includes(dName.toLowerCase());
              }) || res.documents[0];

              if (matched && matched.file_bytes) {
                const ext = matched.extension || (fp.name.split('.').pop() || '');
                const mime = matched.mime_type && matched.mime_type !== 'application/octet-stream'
                  ? matched.mime_type
                  : this.getMimeFromExtension(ext);

                const dataUrl = `data:${mime};base64,${matched.file_bytes}`;
                fp.previewUrl = dataUrl;
                this.previewFileUrl = dataUrl;
                this.safePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl);
              }
            }
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.warn('[FilePreviewModal] On-demand document fetch error:', err);
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
      }
    }
  }

  private getMimeFromExtension(ext: string): string {
    const e = (ext || '').toLowerCase();
    if (e === 'pdf') return 'application/pdf';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(e)) return `image/${e === 'jpg' ? 'jpeg' : e}`;
    if (['txt', 'csv', 'json', 'xml', 'log'].includes(e)) return `text/plain`;
    return 'application/octet-stream';
  }

  private cleanUpUrls() {
    if (this.previewFileUrl && this.previewFileUrl.startsWith('blob:')) {
      window.URL.revokeObjectURL(this.previewFileUrl);
    }
  }

  onClose() {
    this.cleanUpUrls();
    this.close.emit();
  }

  ngOnDestroy() {
    this.cleanUpUrls();
  }
}
