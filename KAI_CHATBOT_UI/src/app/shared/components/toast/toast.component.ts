import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, inject, ChangeDetectorRef } from '@angular/core';

export type ToastLayout = 'default' | 'bottom-banner';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  layout: ToastLayout;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-toast',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './toast.component.html',
    styleUrls: ['./toast.component.scss']
})
export class ToastComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  toasts: Toast[] = [];
  private nextId = 0;

  show(
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
    duration = 3000,
    layout: ToastLayout = 'default',
  ) {
    const id = this.nextId++;
    const resolvedLayout: ToastLayout =
      type === 'success' && layout === 'bottom-banner' ? 'bottom-banner' : 'default';
    this.toasts.push({ id, message, type, layout: resolvedLayout });
    this.cdr.markForCheck();

    setTimeout(() => this.removeToast(id), duration);
  }

  get topToasts(): Toast[] {
    return this.toasts.filter((t) => t.layout !== 'bottom-banner');
  }

  get bottomToasts(): Toast[] {
    return this.toasts.filter((t) => t.layout === 'bottom-banner');
  }

  removeToast(id: number) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.cdr.markForCheck();
  }

}
