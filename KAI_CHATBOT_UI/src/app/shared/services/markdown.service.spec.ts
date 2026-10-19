import { TestBed } from '@angular/core/testing';
import { MarkdownService } from './markdown.service';

describe('MarkdownService', () => {
  let service: MarkdownService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MarkdownService],
    });
    service = TestBed.inject(MarkdownService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return empty string for null or empty input', async () => {
    expect(await service.formatMessage('')).toBe('');
    expect(service.formatMessageSync('')).toBe('');
  });

  it('should render basic markdown synchronously and asynchronously', async () => {
    const md = '**Bold text** and *italic text*';
    const asyncResult = await service.formatMessage(md);
    const syncResult = service.formatMessageSync(md);

    expect(asyncResult).toContain('<strong>Bold text</strong>');
    expect(syncResult).toContain('<strong>Bold text</strong>');
  });

  it('should format standard code blocks with highlight.js wrapper', () => {
    const md = '```typescript\nconst x: number = 42;\n```';
    const result = service.formatMessageSync(md);

    expect(result).toContain('class="code-block-wrapper"');
    expect(result).toContain('code-lang-label');
    expect(result).toContain('typescript');
  });

  it('should format mermaid code blocks with mermaid wrapper and action controls', () => {
    const mermaidCode = 'graph TD\nA --> B';
    const md = '```mermaid\n' + mermaidCode + '\n```';
    const result = service.formatMessageSync(md);

    expect(result).toContain('class="mermaid-block-wrapper"');
    expect(result).toContain('data-mermaid="' + encodeURIComponent(mermaidCode) + '"');
    expect(result).toContain('class="mermaid-tab-btn active" data-tab="preview"');
    expect(result).toContain('class="mermaid-tab-btn" data-tab="code"');
    expect(result).toContain('class="mermaid-copy-btn"');
    expect(result).toContain('class="mermaid-preview-container"');
    expect(result).toContain('class="mermaid-code-container"');
    expect(result).toContain('class="mermaid-dropdown"');
    expect(result).toContain('class="mermaid-apply-btn"');
  });
});

