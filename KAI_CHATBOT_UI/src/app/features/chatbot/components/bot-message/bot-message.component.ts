import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  inject,
  DoCheck
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CopyCodeDirective } from '@shared/directives/copy-code.directive';
import { MermaidRenderDirective } from '@shared/directives/mermaid-render.directive';
import { TooltipDirective } from '@shared/directives/tooltip.directive';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';
import { BaseMessageComponent } from '@features/chatbot/components/base-message.component';

@Component({
  selector: 'app-bot-message',
  standalone: true,
  imports: [CommonModule, CopyCodeDirective, MermaidRenderDirective, TooltipDirective, ChatIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bot-message.component.html',
  styleUrls: ['./bot-message.component.scss'],
})
export class BotMessageComponent extends BaseMessageComponent implements DoCheck {
  @Input() showActions = true;
  @Input() showShare = true;
  @Input() isLast = false;

  @Output() shareMessage = new EventEmitter<void>();
  @Output() viewSources = new EventEmitter<any[]>();
  @Output() retryMessage = new EventEmitter<void>();
  @Output() previewImage = new EventEmitter<{ url: string; name: string }>();

  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);
  private lastHtml: string | undefined = undefined;
  private lastMsgText: string | undefined = undefined;
  private lastStatus: string | undefined = undefined;

  sanitizedHtml: SafeHtml = '';

  get isStreaming(): boolean {
    return this.msg?.status === 'streaming' || this.msg?.status === 'pending';
  }

  ngDoCheck(): void {
    if (this.msg) {
      if (
        this.msg.html !== this.lastHtml ||
        this.msg.message !== this.lastMsgText ||
        this.msg.status !== this.lastStatus
      ) {
        this.lastHtml = this.msg.html;
        this.lastMsgText = this.msg.message;
        this.lastStatus = this.msg.status;
        this.sanitizedHtml = this.sanitizer.bypassSecurityTrustHtml(
          this.msg.html || this.msg.message || ''
        );
        this.cdr.markForCheck();
      }
    }
  }

  hasContextAndSource(augSrc: any[] | undefined): boolean {
    if (!augSrc || augSrc.length === 0) return false;
    return augSrc.some(
      (item: any) =>
        item.context && item.context.trim() !== '' &&
        item.source && item.source.trim() !== ''
    );
  }

  // perf-ignore
  getDocumentIconName(extension: string): string {
    const ext = (extension || '').toLowerCase();
    if (ext === 'ppt' || ext === 'pptx') return 'presentation';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'spreadsheet';
    if (ext === 'doc' || ext === 'docx') return 'word-doc';
    if (ext === 'pdf') return 'pdf-doc';
    return 'document';
  }

  // perf-ignore
  isPresentationExtension(extension: string): boolean {
    const ext = (extension || '').toLowerCase();
    return ext === 'ppt' || ext === 'pptx';
  }

  // perf-ignore
  isSpreadsheetExtension(extension: string): boolean {
    const ext = (extension || '').toLowerCase();
    return ext === 'xls' || ext === 'xlsx' || ext === 'csv';
  }

  // perf-ignore
  isWordExtension(extension: string): boolean {
    const ext = (extension || '').toLowerCase();
    return ext === 'doc' || ext === 'docx';
  }

  // perf-ignore
  isPdfExtension(extension: string): boolean {
    return (extension || '').toLowerCase() === 'pdf';
  }

  // perf-ignore
  getDocumentTooltip(extension: string): string {
    const ext = (extension || '').toLowerCase();
    if (ext === 'ppt' || ext === 'pptx') return 'Download presentation';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'Download spreadsheet';
    if (ext === 'doc' || ext === 'docx') return 'Download Word document';
    if (ext === 'pdf') return 'Download PDF';
    return 'Download document';
  }

  // perf-ignore
  getDocumentDisplayName(doc: any): string {
    if (!doc || !doc.name) return 'document';
    const ext = (doc.extension || '').toLowerCase();
    if (ext && doc.name.toLowerCase().endsWith('.' + ext)) {
      return doc.name;
    }
    return ext ? `${doc.name}.${doc.extension}` : doc.name;
  }
}
