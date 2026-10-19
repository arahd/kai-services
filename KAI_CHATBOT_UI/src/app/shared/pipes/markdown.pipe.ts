import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MarkdownService } from '@shared/services/markdown.service';

@Pipe({
  name: 'markdown',
  standalone: true,
})
export class MarkdownPipe implements PipeTransform {
  private readonly markdownService = inject(MarkdownService);
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    const rawHtml = this.markdownService.formatMessageSync(value);
    return this.sanitizer.bypassSecurityTrustHtml(rawHtml);
  }
}
