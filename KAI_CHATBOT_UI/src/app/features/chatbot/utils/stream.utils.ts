/** ---------- Streaming helpers (SSE-tolerant + markdown stability) ---------- */

/**
 * SSE/JSONL tolerant line parser.
 */
export function parseStreamLine(line: string): any | null {
  const trimmed = (line || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('event:')) return null; // ignore named events
  if (trimmed.startsWith(':')) return null; // SSE keep-alive
  const payload = trimmed.startsWith('data:')
    ? trimmed.slice(5).trim()
    : trimmed;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Small streaming buffer that tracks code fence open/close and render cadence.
 */
export class MarkdownStreamBuffer {
  private raw = '';
  private openFenceLang: string | null = null;
  private lastRenderAt = 0;

  append(text: string) {
    if (!text) return;
    this.raw += text;
    this.trackFenceState(text);
  }

  getRaw(): string {
    return this.raw;
  }

  isInsideFence(): boolean {
    return !!this.openFenceLang;
  }

  // Throttle renders (~60ms) and only when we hit safe boundaries (unless forced)
  shouldRender(now = performance.now(), force = false): boolean {
    if (now - this.lastRenderAt < 60) return false;

    // If we are currently typing a table row, wait until the row finishes.
    const lastNewlineIdx = this.raw.lastIndexOf('\n');
    const currentLine = this.raw.substring(lastNewlineIdx + 1);
    if (currentLine.trimStart().startsWith('|')) {
      return false;
    }

    if (force) return true;

    // If inside a code fence, render line-by-line to show code progressively
    if (this.isInsideFence()) {
      if (/\n$/.test(this.raw)) return true;
      return false; // Wait until the current line of code finishes
    }

    const tail = this.raw.slice(-8);
    if (/\n\n$/.test(tail)) return true; // paragraph end
    if (/[.!?]\s$/.test(tail)) return true; // sentence end
    if (/\n\|.*\|\n$/.test(this.raw)) return true; // table row
    return false;
  }

  markRendered() {
    this.lastRenderAt = performance.now();
  }

  private trackFenceState(added: string) {
    const fenceRegex = /```(\w+)?/g;
    let m: RegExpExecArray | null;
    while ((m = fenceRegex.exec(added))) {
      if (!this.openFenceLang) {
        this.openFenceLang = (m[1] || '').trim() || '';
      } else {
        this.openFenceLang = null; // close fence
      }
    }
  }
}
