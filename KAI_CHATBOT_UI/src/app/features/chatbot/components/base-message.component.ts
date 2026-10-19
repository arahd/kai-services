import { Directive, EventEmitter, Input, Output, inject } from '@angular/core';
import { ChatMessage, FilePreview } from '@shared/models';
import { FileUtils } from '@shared/utils/file.utils';
import { ToastService } from '@core/services/toast.service';

/**
 * Abstract Base Class for chat message components.
 * Consolidates common @Inputs, file utility methods, and clipboard logic.
 */
@Directive() // Required by Angular for base classes that use DI or @Input
export abstract class BaseMessageComponent {
  
  @Input() msg!: ChatMessage;
  @Input() index = 0;
  @Input() copied = false;

  @Output() copyMessage = new EventEmitter<void>();
  @Output() downloadFile = new EventEmitter<string>();

  protected toastService = inject(ToastService);

  // --- Shared File Utilities ---
  
  isImageFile(name: string): boolean {
    return FileUtils.isImageFile(name);
  }

  isPdfFile(name: string): boolean {
    return FileUtils.isPdfFile(name);
  }

  isWordFile(name: string): boolean {
    return FileUtils.isWordFile(name);
  }

  isSpreadsheetFile(name: string): boolean {
    return FileUtils.isSpreadsheetFile(name);
  }

  isPresentationFile(name: string): boolean {
    return FileUtils.isPresentationFile(name);
  }

  getFileIconName(name: string): string {
    return FileUtils.getFileIconName(name);
  }

  getFileType(name: string): string {
    return FileUtils.getFileType(name);
  }

  humanFileSize(bytes: number): string {
    return FileUtils.humanFileSize(bytes);
  }

  // --- Shared Clipboard Utilities ---

  onCopy(textToCopy: string): void {
    if (!textToCopy) return;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => this.showCopySuccess())
        .catch((err) => this.fallbackCopyTextToClipboard(textToCopy));
    } else {
      this.fallbackCopyTextToClipboard(textToCopy);
    }
  }

  private fallbackCopyTextToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.showCopySuccess();
      } else {
        this.toastService.show('Failed to copy text', 'error');
      }
    } catch (err) {
      this.toastService.show('Unable to copy', 'error');
    }

    document.body.removeChild(textArea);
  }

  private showCopySuccess(): void {
    this.copied = true;
    this.copyMessage.emit();
    setTimeout(() => {
      this.copied = false;
    }, 2000);
  }
}
