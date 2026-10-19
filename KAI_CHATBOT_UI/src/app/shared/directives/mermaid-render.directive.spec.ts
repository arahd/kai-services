import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MermaidRenderDirective } from './mermaid-render.directive';
import { MermaidService } from '@shared/services/mermaid.service';

@Component({
  standalone: true,
  imports: [MermaidRenderDirective],
  template: `
    <div
      [appMermaidRender]="rawContent"
      [isStreaming]="isStreaming"
      [innerHTML]="safeContent"
    ></div>
  `,
})
class TestHostComponent {
  private sanitizer = inject(DomSanitizer);
  rawContent: string = '';
  safeContent: SafeHtml = '';
  isStreaming: boolean = false;

  setContent(html: string) {
    this.rawContent = html;
    this.safeContent = this.sanitizer.bypassSecurityTrustHtml(html);
  }
}

describe('MermaidRenderDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let mermaidServiceMock: jasmine.SpyObj<MermaidService>;

  beforeEach(async () => {
    mermaidServiceMock = jasmine.createSpyObj('MermaidService', [
      'render',
      'downloadPng',
      'downloadSvg',
      'copySvg',
    ]);

    await TestBed.configureTestingModule({
      imports: [TestHostComponent, MermaidRenderDirective],
      providers: [{ provide: MermaidService, useValue: mermaidServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
  });

  it('should not render diagram while isStreaming is true', fakeAsync(() => {
    host.isStreaming = true;
    host.setContent(`
      <div class="mermaid-block-wrapper" data-mermaid="graph%20TD%0AA%20--%3E%20B">
        <div class="mermaid-preview-container"></div>
        <div class="mermaid-code-container"></div>
      </div>
    `);
    fixture.detectChanges();
    tick(50);
    flush();

    expect(mermaidServiceMock.render).not.toHaveBeenCalled();
  }));

  it('should render diagram when isStreaming is false and content contains mermaid wrapper', fakeAsync(() => {
    mermaidServiceMock.render.and.resolveTo({
      success: true,
      svg: '<svg id="test-svg"></svg>',
    });

    host.isStreaming = false;
    host.setContent(`
      <div class="mermaid-block-wrapper" data-mermaid="graph%20TD%0AA%20--%3E%20B">
        <div class="mermaid-header">
          <div class="mermaid-header-actions">
            <span class="mermaid-tab-btn active" data-tab="preview">Preview</span>
            <span class="mermaid-tab-btn" data-tab="code">Code</span>
            <span class="mermaid-copy-btn"></span>
          </div>
        </div>
        <div class="mermaid-preview-container"></div>
        <div class="mermaid-code-container" style="display: none;"></div>
      </div>
    `);
    fixture.detectChanges();
    tick(50);
    flush();

    expect(mermaidServiceMock.render).toHaveBeenCalledWith('graph TD\nA --> B');

    const previewContainer = fixture.nativeElement.querySelector('.mermaid-preview-container');
    expect(previewContainer.innerHTML).toContain('test-svg');
  }));

  it('should toggle tabs when preview and code buttons are clicked', fakeAsync(() => {
    mermaidServiceMock.render.and.resolveTo({
      success: true,
      svg: '<svg id="test-svg"></svg>',
    });

    host.isStreaming = false;
    host.setContent(`
      <div class="mermaid-block-wrapper" data-mermaid="graph%20TD">
        <div class="mermaid-header">
          <div class="mermaid-header-actions">
            <span class="mermaid-tab-btn active" data-tab="preview">Preview</span>
            <span class="mermaid-tab-btn" data-tab="code">Code</span>
            <span class="mermaid-copy-btn"></span>
          </div>
        </div>
        <div class="mermaid-preview-container"></div>
        <div class="mermaid-code-container" style="display: none;"></div>
      </div>
    `);
    fixture.detectChanges();
    tick(50);
    flush();

    const codeBtn = fixture.nativeElement.querySelector('.mermaid-tab-btn[data-tab="code"]');
    const previewBtn = fixture.nativeElement.querySelector('.mermaid-tab-btn[data-tab="preview"]');
    const previewContainer = fixture.nativeElement.querySelector('.mermaid-preview-container');
    const codeContainer = fixture.nativeElement.querySelector('.mermaid-code-container');

    codeBtn.click();
    expect(codeBtn.classList.contains('active')).toBeTrue();
    expect(previewBtn.classList.contains('active')).toBeFalse();
    expect(previewContainer.classList.contains('hidden')).toBeTrue();
    expect(codeContainer.classList.contains('active')).toBeTrue();

    previewBtn.click();
    expect(previewBtn.classList.contains('active')).toBeTrue();
    expect(codeBtn.classList.contains('active')).toBeFalse();
    expect(previewContainer.classList.contains('hidden')).toBeFalse();
    expect(codeContainer.classList.contains('active')).toBeFalse();
  }));

  it('should show error fallback when render fails', fakeAsync(() => {
    mermaidServiceMock.render.and.resolveTo({
      success: false,
      error: 'Syntax error in graph',
    });

    host.isStreaming = false;
    host.setContent(`
      <div class="mermaid-block-wrapper" data-mermaid="bad%20syntax">
        <div class="mermaid-header">
          <div class="mermaid-header-actions">
            <span class="mermaid-tab-btn active" data-tab="preview">Preview</span>
            <span class="mermaid-tab-btn" data-tab="code">Code</span>
          </div>
        </div>
        <div class="mermaid-preview-container"></div>
        <div class="mermaid-code-container" style="display: none;"></div>
        <div class="mermaid-code-container"></div>
      </div>
    `);
    fixture.detectChanges();
    tick(50);
    flush();

    const previewContainer = fixture.nativeElement.querySelector('.mermaid-preview-container');
    const codeContainer = fixture.nativeElement.querySelector('.mermaid-code-container');

    expect(previewContainer.innerHTML).toContain('mermaid-error-banner');
    expect(previewContainer.innerHTML).toContain('Syntax error in graph');
    expect(codeContainer.classList.contains('active')).toBeTrue();
  }));

  it('should mount textarea in editorMount and re-render when apply button is clicked', fakeAsync(() => {
    mermaidServiceMock.render.and.resolveTo({
      success: true,
      svg: '<svg id="initial-svg"></svg>',
    });

    host.isStreaming = false;
    host.setContent(`
      <div class="mermaid-block-wrapper" data-mermaid="graph%20TD%0AA%20--%3E%20B">
        <div class="mermaid-header">
          <div class="mermaid-header-actions">
            <span class="mermaid-tab-btn active" data-tab="preview">Preview</span>
            <span class="mermaid-tab-btn" data-tab="code">Code</span>
            <span class="mermaid-copy-btn"></span>
          </div>
        </div>
        <div class="mermaid-preview-container"></div>
        <div class="mermaid-code-container">
          <div class="mermaid-editor-mount"></div>
          <div class="mermaid-code-footer">
            <span class="mermaid-apply-btn">Apply</span>
          </div>
        </div>
      </div>
    `);
    fixture.detectChanges();
    tick(50);
    flush();

    const textarea = fixture.nativeElement.querySelector('.mermaid-code-editor') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('graph TD\nA --> B');

    // Simulate editing code and clicking apply
    mermaidServiceMock.render.and.resolveTo({
      success: true,
      svg: '<svg id="updated-svg"></svg>',
    });

    textarea.value = 'graph TD\nA --> C';
    const applyBtn = fixture.nativeElement.querySelector('.mermaid-apply-btn');
    applyBtn.click();
    tick(50);
    flush();

    expect(mermaidServiceMock.render).toHaveBeenCalledWith('graph TD\nA --> C');
    const previewContainer = fixture.nativeElement.querySelector('.mermaid-preview-container');
    expect(previewContainer.innerHTML).toContain('updated-svg');
    expect(previewContainer.classList.contains('hidden')).toBeFalse();
  }));

  it('should toggle export dropdown and trigger export methods', fakeAsync(() => {
    mermaidServiceMock.render.and.resolveTo({
      success: true,
      svg: '<svg id="test-svg"></svg>',
    });
    mermaidServiceMock.downloadPng.and.resolveTo(true);
    mermaidServiceMock.downloadSvg.and.stub();

    host.isStreaming = false;
    host.setContent(`
      <div class="mermaid-block-wrapper" data-mermaid="graph%20TD">
        <div class="mermaid-header">
          <div class="mermaid-header-actions">
            <span class="mermaid-tab-btn active" data-tab="preview">Preview</span>
            <div class="mermaid-dropdown">
              <span class="mermaid-export-btn">Export</span>
              <div class="mermaid-dropdown-menu">
                <span class="mermaid-dropdown-item" data-export="png">PNG</span>
                <span class="mermaid-dropdown-item" data-export="svg">SVG</span>
              </div>
            </div>
          </div>
        </div>
        <div class="mermaid-preview-container"></div>
        <div class="mermaid-code-container"></div>
      </div>
    `);
    fixture.detectChanges();
    tick(50);
    flush();

    const dropdown = fixture.nativeElement.querySelector('.mermaid-dropdown');
    const exportBtn = fixture.nativeElement.querySelector('.mermaid-export-btn');
    const pngItem = fixture.nativeElement.querySelector('.mermaid-dropdown-item[data-export="png"]');

    exportBtn.click();
    expect(dropdown.classList.contains('open')).toBeTrue();

    pngItem.click();
    tick(50);
    flush();

    expect(mermaidServiceMock.downloadPng).toHaveBeenCalled();
    expect(dropdown.classList.contains('open')).toBeFalse();
  }));
});
