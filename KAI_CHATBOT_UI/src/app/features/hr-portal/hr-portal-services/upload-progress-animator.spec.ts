import { UploadProgressAnimator, UploadProgressSnapshot } from './upload-progress-animator';

describe('UploadProgressAnimator', () => {
  let animator: UploadProgressAnimator;
  let updates: UploadProgressSnapshot[];
  let completed: boolean;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate();
    updates = [];
    completed = false;
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('should start and update progress in dualFile mode', () => {
    animator = new UploadProgressAnimator(
      snapshot => updates.push(snapshot),
      () => { completed = true; },
      { minDurationMs: 1000, dualFile: true }
    );

    animator.start();
    expect(updates[0]).toEqual({ resume: 0, jd: 0 });

    animator.markResponseReady();
    jasmine.clock().tick(3500);

    expect(completed).toBeTrue();
    expect(updates[updates.length - 1]).toEqual({ resume: 100, jd: 100 });
  });

  it('should support localAttach mode', () => {
    animator = new UploadProgressAnimator(
      snapshot => updates.push(snapshot),
      () => { completed = true; },
      { minDurationMs: 1000, dualFile: false, localAttach: true }
    );

    animator.start();
    jasmine.clock().tick(3500);

    expect(completed).toBeTrue();
  });

  it('should allow setting targets and cancelling', () => {
    animator = new UploadProgressAnimator(
      snapshot => updates.push(snapshot),
      () => { completed = true; },
      { minDurationMs: 1000 }
    );

    animator.start();
    animator.setTargets(50, 50);
    animator.cancel();

    const updateCount = updates.length;
    jasmine.clock().tick(200);

    expect(updates.length).toBe(updateCount);
  });
});
