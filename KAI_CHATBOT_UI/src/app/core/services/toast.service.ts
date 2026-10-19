import { Injectable } from '@angular/core';
import { ToastComponent } from '@shared/components/toast/toast.component';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toastComp!: ToastComponent;

  register(toastComp: ToastComponent) {
    this.toastComp = toastComp;
  }

  /**
   * @param layout `bottom-banner` — white pill + green check (success only), fixed bottom center.
   */
  show(
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
    duration = 3000,
    layout: 'default' | 'bottom-banner' = 'default',
  ) {
    this.toastComp?.show(message, type, duration, layout);
  }
}
