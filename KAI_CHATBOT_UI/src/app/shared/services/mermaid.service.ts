import { Injectable } from '@angular/core';

export interface MermaidRenderResult {
  success: boolean;
  svg?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class MermaidService {
  private mermaidModule: any = null;
  private isInitialized = false;
  private renderCounter = 0;

  /**
   * Lazily loads the mermaid module on first invocation to keep initial bundle size lean.
   */
  private async getMermaid(): Promise<any> {
    if (!this.mermaidModule) {
      const mod = await import('mermaid');
      this.mermaidModule = (mod as any).default || mod;
    }

    if (!this.isInitialized) {
      const isDark =
        typeof document !== 'undefined' &&
        (document.body.classList.contains('dark-theme') ||
          document.documentElement.classList.contains('dark'));

      this.mermaidModule.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: isDark ? 'dark' : 'neutral',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontSize: 14,
        logLevel: 'error',
        flowchart: {
          htmlLabels: false,
          useMaxWidth: true,
        },
      });
      this.isInitialized = true;
    }

    return this.mermaidModule;
  }

  /**
   * Renders a Mermaid diagram definition into an SVG string.
   * If syntax is invalid, captures the error and returns it without throwing.
   */
  async render(diagramCode: string): Promise<MermaidRenderResult> {
    const trimmed = (diagramCode || '').trim();
    if (!trimmed) {
      return { success: false, error: 'Empty diagram definition' };
    }

    const uniqueId = `mermaidChart${Date.now()}${++this.renderCounter}`;

    try {
      const mermaid = await this.getMermaid();

      // Validate syntax first
      const parseResult = await mermaid.parse(trimmed);
      if (parseResult === false) {
        return { success: false, error: 'Invalid Mermaid syntax' };
      }

      // Render to SVG
      const result = await mermaid.render(uniqueId, trimmed);
      const svg = typeof result === 'string' ? result : result?.svg;

      return {
        success: true,
        svg: svg || '',
      };
    } catch (err: any) {
      console.warn('Mermaid rendering failed:', err);

      // Clean up any residual elements that mermaid may have attached to body on failure
      if (typeof document !== 'undefined') {
        const orphanedEl =
          document.getElementById(uniqueId) || document.getElementById(`d${uniqueId}`);
        if (orphanedEl && orphanedEl.parentElement) {
          orphanedEl.parentElement.removeChild(orphanedEl);
        }
      }

      return {
        success: false,
        error: err?.message || 'Invalid or unsupported Mermaid syntax',
      };
    }
  }

  /**
   * Serializes an SVGElement into well-formed XML string with necessary namespaces.
   * Can sanitize and embed explicit dimensions for canvas rasterization.
   */
  serializeSvg(
    svgEl: SVGElement,
    forRasterization = false,
    explicitWidth?: number,
    explicitHeight?: number
  ): string {
    const clone = svgEl.cloneNode(true) as SVGElement;

    // Ensure valid SVG namespace declarations
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    if (!clone.getAttribute('xmlns:xlink')) {
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }

    // Determine intrinsic dimensions from viewBox or parameters
    const viewBox = clone.getAttribute('viewBox');
    let width = explicitWidth || 800;
    let height = explicitHeight || 600;

    if (viewBox) {
      const parts = viewBox.split(/\s+|,/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        width = parts[2];
        height = parts[3];
      }
    }

    if (forRasterization) {
      // Must have concrete pixel width/height attributes so Image has intrinsic size in Canvas
      clone.setAttribute('width', `${width}`);
      clone.setAttribute('height', `${height}`);
      clone.style.maxWidth = 'none';

      // Convert any <foreignObject> elements to SVG <text> elements to prevent Canvas tainting
      const foreignObjects = Array.from(clone.querySelectorAll('foreignObject'));
      for (const fo of foreignObjects) {
        const text = fo.textContent?.trim() || '';
        const x = parseFloat(fo.getAttribute('x') || '0');
        const y = parseFloat(fo.getAttribute('y') || '0');
        const w = parseFloat(fo.getAttribute('width') || '0');
        const h = parseFloat(fo.getAttribute('height') || '0');

        const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textEl.setAttribute('x', `${x + w / 2}`);
        textEl.setAttribute('y', `${y + h / 2}`);
        textEl.setAttribute('text-anchor', 'middle');
        textEl.setAttribute('dominant-baseline', 'central');
        textEl.setAttribute('fill', 'currentColor');
        textEl.setAttribute('font-family', 'Inter, system-ui, sans-serif');
        textEl.setAttribute('font-size', '13px');
        textEl.textContent = text;

        fo.parentNode?.replaceChild(textEl, fo);
      }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(clone);
  }

  /**
   * Triggers a client-side download of an SVGElement as a `.svg` vector file.
   */
  downloadSvg(svgEl: SVGElement, filename = 'diagram.svg'): void {
    if (typeof document === 'undefined' || !svgEl) return;

    try {
      const source = this.serializeSvg(svgEl, false);
      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Delayed revocation so browser download manager has time to retrieve the blob
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error('[MermaidService] SVG download error:', err);
    }
  }

  /**
   * Copies the SVG XML markup directly to the user's clipboard.
   */
  async copySvg(svgEl: SVGElement): Promise<boolean> {
    if (!svgEl || typeof navigator === 'undefined' || !navigator.clipboard) return false;
    try {
      const source = this.serializeSvg(svgEl, false);
      await navigator.clipboard.writeText(source);
      return true;
    } catch (err) {
      console.error('[MermaidService] Copy SVG error:', err);
      return false;
    }
  }

  /**
   * Renders the SVG onto an HTML5 Canvas at 2x resolution and downloads as PNG.
   * Gracefully falls back to SVG download if canvas tainting or rasterization errors occur.
   */
  downloadPng(svgEl: SVGElement, filename = 'diagram.png'): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined' || !svgEl) {
        resolve(false);
        return;
      }

      try {
        const rect = svgEl.getBoundingClientRect();
        const viewBox = svgEl.getAttribute('viewBox');
        let width = rect.width > 0 ? rect.width : 800;
        let height = rect.height > 0 ? rect.height : 600;

        if (viewBox) {
          const parts = viewBox.split(/\s+|,/).map(Number);
          if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
            width = parts[2];
            height = parts[3];
          }
        }

        const source = this.serializeSvg(svgEl, true, width, height);
        const encodedData = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);

        const scale = 2; // 2x resolution for crisp high-DPI export
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(Math.round(width * scale), 200);
        canvas.height = Math.max(Math.round(height * scale), 150);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          this.downloadSvg(svgEl, filename.replace(/\.png$/i, '.svg'));
          resolve(false);
          return;
        }

        const isDark =
          typeof document !== 'undefined' &&
          (document.body.classList.contains('dark-theme') ||
            document.documentElement.classList.contains('dark'));

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          try {
            ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const pngUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = pngUrl;
                  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);

                  setTimeout(() => URL.revokeObjectURL(pngUrl), 10000);
                  resolve(true);
                } else {
                  // Fallback to dataURL
                  try {
                    const dataUrl = canvas.toDataURL('image/png');
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    resolve(true);
                  } catch {
                    this.downloadSvg(svgEl, filename.replace(/\.png$/i, '.svg'));
                    resolve(false);
                  }
                }
              },
              'image/png'
            );
          } catch (canvasErr) {
            console.warn('[MermaidService] Canvas export tainted or failed, falling back to SVG:', canvasErr);
            this.downloadSvg(svgEl, filename.replace(/\.png$/i, '.svg'));
            resolve(false);
          }
        };

        img.onerror = (err) => {
          console.warn('[MermaidService] Rasterization image failed to load, falling back to SVG download:', err);
          this.downloadSvg(svgEl, filename.replace(/\.png$/i, '.svg'));
          resolve(false);
        };

        img.src = encodedData;
      } catch (err) {
        console.error('[MermaidService] PNG export failed with exception:', err);
        try {
          this.downloadSvg(svgEl, filename.replace(/\.png$/i, '.svg'));
        } catch {}
        resolve(false);
      }
    });
  }
}
