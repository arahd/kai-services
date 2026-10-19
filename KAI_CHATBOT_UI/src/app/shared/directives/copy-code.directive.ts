import { Directive, ElementRef, Renderer2, Input, OnChanges, SimpleChanges, inject } from '@angular/core';

@Directive({
  selector: '[appCopyCode]',
  standalone: true
})
export class CopyCodeDirective implements OnChanges {
  @Input('appCopyCode') htmlContent: string | null = null;
  @Input() isStreaming = false;

  private readonly el = inject(ElementRef);
  private readonly renderer = inject(Renderer2);

  ngOnChanges(changes: SimpleChanges) {
    if (this.isStreaming) {
      return; // Do not manipulate DOM while the message is still streaming
    }

    if (changes['htmlContent'] || changes['isStreaming']) {
      // Wait a short tick for Angular to render innerHTML
      setTimeout(() => this.addCopyButtons(), 0);
    }
  }

  private readonly COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  private readonly CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  private addCopyButtons() {
    // --- Handle new ChatGPT-style code blocks with header ---
    const placeholders = this.el.nativeElement.querySelectorAll('.code-header-copy-placeholder');
    placeholders.forEach((placeholder: HTMLElement) => {
      // Skip if already processed
      if (placeholder.getAttribute('data-processed')) return;
      placeholder.setAttribute('data-processed', 'true');

      const wrapper = placeholder.closest('.code-block-wrapper');
      if (!wrapper) return;

      const codeEl = wrapper.querySelector('code');
      if (!codeEl) return;

      const btn = this.renderer.createElement('button');
      this.renderer.addClass(btn, 'code-copy-btn');
      btn.innerHTML = this.COPY_ICON;

      // Add tooltip
      const tooltip = this.renderer.createElement('span');
      this.renderer.addClass(tooltip, 'copy-tooltip');
      this.renderer.setProperty(tooltip, 'innerText', 'Copy code');
      this.renderer.appendChild(btn, tooltip);

      this.renderer.listen(btn, 'click', () => {
        navigator.clipboard.writeText(codeEl.innerText).then(() => {
          btn.innerHTML = this.CHECK_ICON;
          const copiedTooltip = this.renderer.createElement('span');
          this.renderer.addClass(copiedTooltip, 'copy-tooltip');
          this.renderer.setProperty(copiedTooltip, 'innerText', 'Copied!');
          this.renderer.appendChild(btn, copiedTooltip);
          setTimeout(() => {
            btn.innerHTML = this.COPY_ICON;
            const resetTooltip = this.renderer.createElement('span');
            this.renderer.addClass(resetTooltip, 'copy-tooltip');
            this.renderer.setProperty(resetTooltip, 'innerText', 'Copy code');
            this.renderer.appendChild(btn, resetTooltip);
          }, 1500);
        });
      });

      // Replace the placeholder with the real button
      const parent = placeholder.parentElement;
      if (parent) {
        this.renderer.insertBefore(parent, btn, placeholder);
        this.renderer.removeChild(parent, placeholder);
      }
    });

    // --- Handle legacy code blocks (pre > code without wrapper) ---
    const preElements = this.el.nativeElement.querySelectorAll('pre code');
    preElements.forEach((codeBlock: HTMLElement) => {
      const pre = codeBlock.parentElement;
      if (!pre || pre.querySelector('.copy-btn')) return;
      if (pre.closest('.code-block-wrapper')) return;

      const btn = this.renderer.createElement('button');
      this.renderer.addClass(btn, 'copy-btn');
      this.renderer.setStyle(btn, 'position', 'absolute');
      this.renderer.setStyle(btn, 'top', '8px');
      this.renderer.setStyle(btn, 'right', '8px');
      this.renderer.setStyle(btn, 'fontSize', '0.75rem');
      this.renderer.setStyle(btn, 'padding', '4px 10px');
      this.renderer.setStyle(btn, 'border', '1px solid #e3e8ef');
      this.renderer.setStyle(btn, 'borderRadius', '6px');
      this.renderer.setStyle(btn, 'background', '#f6f8fa');
      this.renderer.setStyle(btn, 'color', '#374151');
      this.renderer.setStyle(btn, 'cursor', 'pointer');
      this.renderer.setStyle(btn, 'fontWeight', '500');
      this.renderer.setProperty(btn, 'innerText', 'Copy');

      this.renderer.listen(btn, 'click', () => {
        navigator.clipboard.writeText(codeBlock.innerText).then(() => {
          btn.innerText = 'Copied!';
          setTimeout(() => (btn.innerText = 'Copy'), 1000);
        });
      });

      this.renderer.setStyle(pre, 'position', 'relative');
      this.renderer.appendChild(pre, btn);
    });

    // --- Handle tables: add hover-to-show "Copy table" button ---
    const tables = this.el.nativeElement.querySelectorAll('table');
    tables.forEach((table: HTMLElement) => {
      // Skip if already wrapped
      if (table.parentElement?.classList.contains('table-copy-wrapper')) return;

      // Create wrapper div
      const wrapper = this.renderer.createElement('div');
      this.renderer.addClass(wrapper, 'table-copy-wrapper');

      // Insert wrapper before table, then move table inside
      const parent = table.parentElement;
      if (parent) {
        this.renderer.insertBefore(parent, wrapper, table);
        this.renderer.appendChild(wrapper, table);
      }

      // Create the copy button
      const btn = this.renderer.createElement('button');
      this.renderer.addClass(btn, 'table-copy-btn');
      btn.innerHTML = this.COPY_ICON;

      // Add tooltip
      const tooltip = this.renderer.createElement('span');
      this.renderer.addClass(tooltip, 'copy-tooltip');
      this.renderer.setProperty(tooltip, 'innerText', 'Copy table');
      this.renderer.appendChild(btn, tooltip);

      this.renderer.listen(btn, 'click', () => {
        // Build plain-text representation of the table
        const rows = table.querySelectorAll('tr');
        const text = Array.from(rows).map((row: any) => {
          const cells = row.querySelectorAll('th, td');
          return Array.from(cells).map((c: any) => c.innerText.trim()).join('\t');
        }).join('\n');

        navigator.clipboard.writeText(text).then(() => {
          btn.innerHTML = this.CHECK_ICON;
          const copiedTooltip = this.renderer.createElement('span');
          this.renderer.addClass(copiedTooltip, 'copy-tooltip');
          this.renderer.setProperty(copiedTooltip, 'innerText', 'Copied!');
          this.renderer.appendChild(btn, copiedTooltip);
          setTimeout(() => {
            btn.innerHTML = this.COPY_ICON;
            const resetTooltip = this.renderer.createElement('span');
            this.renderer.addClass(resetTooltip, 'copy-tooltip');
            this.renderer.setProperty(resetTooltip, 'innerText', 'Copy table');
            this.renderer.appendChild(btn, resetTooltip);
          }, 1500);
        });
      });

      this.renderer.appendChild(wrapper, btn);
    });

  }
}
