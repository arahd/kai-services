import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  AfterViewInit,
  SimpleChanges,
  inject,
} from '@angular/core';
import { MermaidService } from '@shared/services/mermaid.service';

@Directive({
  selector: '[appMermaidRender]',
  standalone: true,
})
export class MermaidRenderDirective implements OnChanges, AfterViewInit {
  @Input('appMermaidRender') htmlContent: string | null = null;
  @Input() isStreaming = false;

  private readonly el = inject(ElementRef);
  private readonly mermaidService = inject(MermaidService);

  private readonly COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  private readonly CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  ngAfterViewInit(): void {
    if (!this.isStreaming) {
      setTimeout(() => this.processMermaidWrappers(), 20);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.isStreaming) {
      return;
    }

    setTimeout(() => this.processMermaidWrappers(), 20);
  }

  private async processMermaidWrappers(retryCount = 0): Promise<void> {
    const wrappers = this.el.nativeElement.querySelectorAll('.mermaid-block-wrapper');

    if (wrappers.length === 0 && retryCount < 5) {
      setTimeout(() => this.processMermaidWrappers(retryCount + 1), 60);
      return;
    }

    for (const wrapper of Array.from(wrappers) as HTMLElement[]) {
      if (wrapper.getAttribute('data-mermaid-processed') === 'true') {
        continue;
      }
      wrapper.setAttribute('data-mermaid-processed', 'true');

      const previewContainer = wrapper.querySelector('.mermaid-preview-container') as HTMLElement;
      const codeContainer = wrapper.querySelector('.mermaid-code-container') as HTMLElement;
      const editorMount = wrapper.querySelector('.mermaid-editor-mount') as HTMLElement;
      const tabButtons = wrapper.querySelectorAll('.mermaid-tab-btn:not(.mermaid-export-btn)');
      const copyBtn = wrapper.querySelector('.mermaid-copy-btn') as HTMLElement;
      const applyBtn = wrapper.querySelector('.mermaid-apply-btn') as HTMLElement;
      const dropdown = wrapper.querySelector('.mermaid-dropdown') as HTMLElement;
      const exportBtn = wrapper.querySelector('.mermaid-export-btn') as HTMLElement;
      const dropdownItems = wrapper.querySelectorAll('.mermaid-dropdown-item');

      // Extract raw code
      const rawEncoded = wrapper.getAttribute('data-mermaid') || '';
      let rawCode = '';
      if (rawEncoded) {
        try {
          rawCode = decodeURIComponent(rawEncoded);
        } catch {
          rawCode = rawEncoded;
        }
      }

      // Fallback 1: Check dedicated raw code store textarea
      if (!rawCode) {
        const rawStore = wrapper.querySelector('.mermaid-raw-code-store') as HTMLTextAreaElement;
        if (rawStore && rawStore.value) {
          rawCode = rawStore.value.trim();
        }
      }

      // Fallback 2: Check pre/code element inside editorMount BEFORE replacing it
      if (!rawCode && editorMount) {
        const codeElement = editorMount.querySelector('code, pre');
        if (codeElement) {
          rawCode = (codeElement as HTMLElement).innerText.trim();
        }
      }

      // 1. Mount interactive textarea editor in Code tab
      let textarea: HTMLTextAreaElement | null = null;
      if (editorMount) {
        textarea = document.createElement('textarea');
        textarea.className = 'mermaid-code-editor';
        textarea.spellcheck = false;
        textarea.value = rawCode;
        editorMount.replaceChildren(textarea);
      }

      // Helper to render or re-render diagram code
      const executeRender = async (codeToRender: string): Promise<boolean> => {
        if (!codeToRender || !previewContainer) return false;

        const result = await this.mermaidService.render(codeToRender);

        if (result.success && result.svg) {
          previewContainer.innerHTML = result.svg;
          previewContainer.classList.remove('hidden');

          const svgEl = previewContainer.querySelector('svg');
          if (svgEl) {
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
            svgEl.style.display = 'block';
            svgEl.style.margin = '0 auto';
          }
          return true;
        } else {
          console.warn('[MermaidRender] Render error:', result.error);
          previewContainer.innerHTML = `
            <div class="mermaid-error-banner">
              <span class="mermaid-error-icon">⚠️</span>
              <div class="mermaid-error-msg">
                <span>Could not render diagram. Please check syntax.</span>
                <small>${this.escapeHtml(result.error || '')}</small>
              </div>
            </div>
          `;
          return false;
        }
      };

      // 2. Setup Tab Switching (Preview vs Code)
      tabButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const target = btn as HTMLElement;
          const tab = target.getAttribute('data-tab');

          tabButtons.forEach((b) => b.classList.remove('active'));
          target.classList.add('active');

          if (tab === 'preview') {
            if (previewContainer) previewContainer.classList.remove('hidden');
            if (codeContainer) codeContainer.classList.remove('active');
          } else {
            if (previewContainer) previewContainer.classList.add('hidden');
            if (codeContainer) codeContainer.classList.add('active');
          }
        });
      });

      // 3. Setup Apply & Re-render button
      if (applyBtn && textarea) {
        applyBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const updatedCode = textarea!.value.trim();
          if (!updatedCode) return;

          applyBtn.classList.add('loading');
          const success = await executeRender(updatedCode);
          applyBtn.classList.remove('loading');

          if (success) {
            rawCode = updatedCode;
            wrapper.setAttribute('data-mermaid', encodeURIComponent(updatedCode));

            // Switch back to Preview tab
            if (previewContainer) previewContainer.classList.remove('hidden');
            if (codeContainer) codeContainer.classList.remove('active');

            tabButtons.forEach((b) => {
              if (b.getAttribute('data-tab') === 'preview') {
                b.classList.add('active');
              } else {
                b.classList.remove('active');
              }
            });
          }
        });
      }

      // 4. Setup Copy Code Button
      if (copyBtn) {
        copyBtn.innerHTML = this.COPY_ICON;
        copyBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const codeToCopy = textarea ? textarea.value : rawCode;
          navigator.clipboard.writeText(codeToCopy).then(() => {
            copyBtn.innerHTML = this.CHECK_ICON;
            copyBtn.setAttribute('title', 'Copied!');
            setTimeout(() => {
              copyBtn.innerHTML = this.COPY_ICON;
              copyBtn.setAttribute('title', 'Copy diagram code');
            }, 1500);
          });
        });
      }

      // 5. Setup Export Dropdown
      if (dropdown && exportBtn) {
        exportBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropdown.classList.toggle('open');
        });

        // Close dropdown when clicking anywhere else
        document.addEventListener('click', (e) => {
          if (!dropdown.contains(e.target as Node)) {
            dropdown.classList.remove('open');
          }
        });

        // Export Actions
        dropdownItems.forEach((item) => {
          item.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.remove('open');

            const exportType = (item as HTMLElement).getAttribute('data-export');
            const svgEl =
              previewContainer?.querySelector('svg') ||
              wrapper.querySelector('.mermaid-preview-container svg') ||
              wrapper.querySelector('svg');

            if (!svgEl) {
              console.warn('[MermaidRender] No rendered SVG found for export');
              return;
            }

            const originalBtnHtml = exportBtn.innerHTML;

            if (exportType === 'png') {
              exportBtn.innerHTML = '<span>⏳ Exporting...</span>';
              const ok = await this.mermaidService.downloadPng(svgEl);
              exportBtn.innerHTML = ok ? '<span>✓ PNG Saved</span>' : '<span>✓ Diagram Saved</span>';
              setTimeout(() => {
                exportBtn.innerHTML = originalBtnHtml;
              }, 2000);
            } else if (exportType === 'svg') {
              exportBtn.innerHTML = '<span>✓ SVG Saved</span>';
              this.mermaidService.downloadSvg(svgEl);
              setTimeout(() => {
                exportBtn.innerHTML = originalBtnHtml;
              }, 2000);
            } else if (exportType === 'copy-svg') {
              const copied = await this.mermaidService.copySvg(svgEl);
              if (copied) {
                exportBtn.innerHTML = '<span>✓ Copied!</span>';
                const prevText = (item as HTMLElement).innerText;
                (item as HTMLElement).innerText = '✓ Copied!';
                setTimeout(() => {
                  (item as HTMLElement).innerText = prevText;
                  exportBtn.innerHTML = originalBtnHtml;
                }, 2000);
              }
            }
          });
        });
      }

      // 6. Initial Diagram Render
      if (rawCode && previewContainer) {
        try {
          const success = await executeRender(rawCode);
          if (!success && codeContainer) {
            codeContainer.classList.add('active');
            tabButtons.forEach((b) => {
              if (b.getAttribute('data-tab') === 'code') {
                b.classList.add('active');
              } else {
                b.classList.remove('active');
              }
            });
          }
        } catch (err: any) {
          console.error('[MermaidRender] Unexpected render exception:', err);
          if (codeContainer) {
            codeContainer.classList.add('active');
          }
        }
      }
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
