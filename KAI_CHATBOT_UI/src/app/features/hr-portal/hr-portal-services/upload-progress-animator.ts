export interface UploadProgressSnapshot {
  resume: number;
  jd: number;
}

export interface UploadProgressAnimatorOptions {
  /** Minimum time (ms) before onComplete runs after the HTTP response is ready. */
  minDurationMs?: number;
  /** When false, only the resume bar is animated (LinkedIn tab). */
  dualFile?: boolean;
  /** Local file pick: run full timeline immediately (no wait for HTTP). */
  localAttach?: boolean;
}

/** JD Analysis: one progress bar reaches 100% in this many ms from select/upload start. */
export const JD_FILE_PROGRESS_MS = 2000;

/**
 * Drives upload progress UI on a fixed timeline so users always see the bars fill,
 * even when the real multipart upload finishes in milliseconds.
 */
export class UploadProgressAnimator {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private resumeShown = 0;
  private jdShown = 0;
  private responseReady = false;
  private holdAt100Until = 0;
  private readonly minMs: number;
  private readonly dualFile: boolean;
  private readonly localAttach: boolean;
  private readonly tickMs = 40;
  private readonly holdAt100Ms = 450;
  /** Hold near-complete until the server responds. */
  private readonly preResponseCap = 0.92;

  constructor(
    private readonly onUpdate: (snapshot: UploadProgressSnapshot) => void,
    private readonly onComplete: () => void,
    options?: UploadProgressAnimatorOptions,
  ) {
    this.minMs = options?.minDurationMs ?? 3200;
    this.dualFile = options?.dualFile ?? true;
    this.localAttach = options?.localAttach ?? false;
  }

  start() {
    this.stop();
    this.startedAt = Date.now();
    this.resumeShown = 0;
    this.jdShown = 0;
    this.responseReady = this.localAttach;
    this.holdAt100Until = 0;
    this.onUpdate({ resume: 0, jd: 0 });
    this.intervalId = setInterval(() => this.tick(), this.tickMs);
  }

  /** Optional: nudge targets when real upload progress events arrive (capped by timeline). */
  setTargets(_resume: number, _jd = 0) {
    // Timeline drives the visible UI; HTTP progress is not applied directly.
  }

  markResponseReady() {
    this.responseReady = true;
  }

  cancel() {
    this.stop();
  }

  private stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick() {
    const elapsed = Date.now() - this.startedAt;
    const maxTimeline =
      this.localAttach || this.responseReady ? 1 : this.preResponseCap;
    const timeline = Math.min(maxTimeline, elapsed / this.minMs);

    let resumeGoal = 0;
    let jdGoal = 0;

    if (this.dualFile) {
      if (timeline <= 0.55) {
        resumeGoal = Math.min(100, Math.round((timeline / 0.55) * 100));
      } else {
        resumeGoal = 100;
        jdGoal = Math.min(100, Math.round(((timeline - 0.55) / 0.45) * 100));
      }
    } else {
      resumeGoal = Math.min(100, Math.round(timeline * 100));
    }

    if (this.localAttach) {
      this.resumeShown = resumeGoal;
      this.jdShown = jdGoal;
    } else {
      this.resumeShown = this.advance(this.resumeShown, resumeGoal);
      this.jdShown = this.advance(this.jdShown, jdGoal);
    }

    this.onUpdate({
      resume: Math.round(this.resumeShown),
      jd: Math.round(this.jdShown),
    });

    const minTimeMet = elapsed >= this.minMs;
    const resumeFull = this.resumeShown >= 99;
    const jdFull = !this.dualFile || this.jdShown >= 99;

    if (!this.responseReady || !minTimeMet || !resumeFull || !jdFull) {
      return;
    }

    this.onUpdate({ resume: 100, jd: this.dualFile ? 100 : 0 });

    if (this.localAttach) {
      this.stop();
      this.onComplete();
      return;
    }

    const now = Date.now();
    if (!this.holdAt100Until) {
      this.holdAt100Until = now + this.holdAt100Ms;
      return;
    }
    if (now < this.holdAt100Until) {
      return;
    }
    this.stop();
    this.onComplete();
  }

  private advance(current: number, target: number): number {
    if (current >= target) return current;
    const delta = Math.max(1.5, (target - current) * 0.12);
    return Math.min(target, current + delta);
  }
}
