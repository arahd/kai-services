import { Injectable } from '@angular/core';
import { marked, Renderer } from 'marked';
import hljs from 'highlight.js';

@Injectable({
  providedIn: 'root',
})
export class MarkdownService {
  /**
   * Converts a markdown string into formatted HTML with highlight.js syntax highlighting asynchronously.
   */
  async formatMessage(message: string): Promise<string> {
    if (!message || typeof message !== 'string') return '';

    const renderer = this.createRenderer();

    try {
      return await marked.parse(message, { renderer });
    } catch (err) {
      console.error('Markdown service parsing error:', err);
      return message;
    }
  }

  /**
   * Converts a markdown string into formatted HTML synchronously for immediate rendering (e.g., in Pipes).
   */
  formatMessageSync(message: string): string {
    if (!message || typeof message !== 'string') return '';

    const renderer = this.createRenderer();

    try {
      // In marked 16.x, parse is synchronous if no async options/walkTokens are configured
      return marked.parse(message, { renderer }) as string;
    } catch (err) {
      console.error('Markdown service sync parsing error:', err);
      return message;
    }
  }

  /**
   * Creates a customized marked Renderer configured for custom links and code blocks.
   */
  private createRenderer(): Renderer {
    const renderer = new Renderer();

    renderer.link = ({
      href,
      title,
      text,
    }: {
      href: string;
      title?: string | null;
      text: string;
    }) => {
      const safeHref = href || '#';
      const titleAttr = title ? ` title="${title}"` : '';

      return `
      <a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>
        ${text}
      </a>
    `;
    };

    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      const normalizedLang = (lang || '').trim().toLowerCase();

      if (normalizedLang === 'mermaid') {
        const encodedCode = encodeURIComponent(text);
        const highlighted = hljs.highlight(text, { language: 'plaintext' }).value;

        return `
      <div class="mermaid-block-wrapper" data-mermaid="${encodedCode}">
        <textarea class="mermaid-raw-code-store" style="display:none !important">${text}</textarea>
        <div class="mermaid-header">
          <div class="mermaid-header-left">
            <span class="mermaid-header-title">📊 Diagram</span>
          </div>
          <div class="mermaid-header-actions">
            <span class="mermaid-tab-btn active" data-tab="preview" role="button" tabindex="0">Preview</span>
            <span class="mermaid-tab-btn" data-tab="code" role="button" tabindex="0">Code</span>
            <div class="mermaid-dropdown">
              <span class="mermaid-tab-btn mermaid-export-btn" role="button" tabindex="0" title="Export diagram">
                <span>Export ▾</span>
              </span>
              <div class="mermaid-dropdown-menu">
                <span class="mermaid-dropdown-item" data-export="png" role="button">🖼️ Download PNG</span>
                <span class="mermaid-dropdown-item" data-export="svg" role="button">📐 Download SVG</span>
                <span class="mermaid-dropdown-item" data-export="copy-svg" role="button">📋 Copy SVG</span>
              </div>
            </div>
            <span class="mermaid-copy-btn" role="button" tabindex="0" title="Copy diagram code"></span>
          </div>
        </div>
        <div class="mermaid-preview-container">
          <div class="mermaid-skeleton">
            <span class="mermaid-spinner"></span>
            <span>Rendering diagram...</span>
          </div>
        </div>
        <div class="mermaid-code-container">
          <div class="mermaid-editor-mount">
            <pre class="code-block"><code class="hljs">${highlighted}</code></pre>
          </div>
          <div class="mermaid-code-footer">
            <span class="mermaid-editor-hint">💡 Edit syntax and re-render</span>
            <span class="mermaid-apply-btn" role="button" tabindex="0">
              <span class="mermaid-apply-icon">▶</span>
              <span>Apply &amp; Re-render</span>
            </span>
          </div>
        </div>
      </div>
    `;
      }

      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(text, { language }).value;
      const displayLang = lang || language;

      return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-label">&lt;/&gt; ${displayLang}</span>
          <span class="code-header-copy-placeholder" data-copy="true"></span>
        </div>
        <pre class="code-block"><code class="hljs ${language}">${highlighted}</code></pre>
      </div>
    `;
    };

    return renderer;
  }
}
