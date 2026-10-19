import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '@core/services/toast.service';
import { TelemetryLoggerService, LogSeverity } from './telemetry-logger.service';

export interface ChatErrorDelegate {
  showSessionExpiredPopup: { set(val: boolean): void };
  showLimitPopup: { set(val: boolean): void };
  resetGeneratingState?(convId: string): void;
}

/**
 * Centralized Error Handler for API and Stream errors.
 */
@Injectable({ providedIn: 'root' })
export class ChatErrorHandlerService {
  private readonly toastService = inject(ToastService);
  private readonly telemetry = inject(TelemetryLoggerService);
  private delegate: ChatErrorDelegate | null = null;

  registerDelegate(d: ChatErrorDelegate): void {
    this.delegate = d;
  }

  handleApiError(error: HttpErrorResponse | any, convId?: string): void {
    console.error('Chat API Error:', error);

    // Send API Error telemetry to Azure Application Insights
    const errObj = error instanceof Error ? error : new Error(error?.message || 'Chat API Error');
    this.telemetry.logException(errObj, LogSeverity.Error, {
      status: error?.status,
      statusText: error?.statusText,
      url: error?.url,
      convId: convId || 'none'
    });

    if (error?.status === 419) {
      this.delegate?.showSessionExpiredPopup.set(true);
    } else if (error?.status === 519) {
      this.delegate?.showLimitPopup.set(true);
    } else {
      // Toast notifications hidden in error handler
      // const msg = error?.error?.message || error?.message || 'Something went wrong. Please try again.';
      // this.toastService.show(msg, 'error');
    }

    if (convId && this.delegate?.resetGeneratingState) {
      this.delegate.resetGeneratingState(convId);
    }
  }

  handleGenericError(message: string): void {
    this.telemetry.logTrace(message, LogSeverity.Error);
    // Toast notifications hidden in error handler
  }
}

