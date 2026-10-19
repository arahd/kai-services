import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { MarkdownPipe } from './markdown.pipe';
import { MarkdownService } from '@shared/services/markdown.service';

describe('MarkdownPipe', () => {
  let pipe: MarkdownPipe;
  let markdownServiceMock: jasmine.SpyObj<MarkdownService>;
  let sanitizerMock: jasmine.SpyObj<DomSanitizer>;

  beforeEach(() => {
    markdownServiceMock = jasmine.createSpyObj('MarkdownService', ['formatMessageSync']);
    sanitizerMock = jasmine.createSpyObj('DomSanitizer', ['bypassSecurityTrustHtml']);

    TestBed.configureTestingModule({
      providers: [
        MarkdownPipe,
        { provide: MarkdownService, useValue: markdownServiceMock },
        { provide: DomSanitizer, useValue: sanitizerMock }
      ]
    });

    pipe = TestBed.inject(MarkdownPipe);
  });

  it('should return empty string for null or empty input', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform('')).toBe('');
  });

  it('should format markdown and bypass html sanitization', () => {
    markdownServiceMock.formatMessageSync.and.returnValue('<p>Formatted</p>');
    sanitizerMock.bypassSecurityTrustHtml.and.returnValue('safeHtml' as any);

    const result = pipe.transform('**Formatted**');

    expect(markdownServiceMock.formatMessageSync).toHaveBeenCalledWith('**Formatted**');
    expect(sanitizerMock.bypassSecurityTrustHtml).toHaveBeenCalledWith('<p>Formatted</p>');
    expect(result).toBe('safeHtml' as any);
  });
});
