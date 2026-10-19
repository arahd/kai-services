import { ErrorHandler, Injectable, inject } from '@angular/core';
import { TelemetryLoggerService, LogSeverity } from './telemetry-logger.service';

/**
 * Global Angular ErrorHandler provider that catches uncaught runtime exceptions
 * and automatically logs them to Azure Application Insights.
 */
@Injectable()
export class GlobalErrorHandlerService implements ErrorHandler {
  private readonly telemetry = inject(TelemetryLoggerService);

  handleError(error: any): void {
    // Log to browser console during development
    console.error('[GlobalErrorHandlerService]:', error);

    // Extract normalized Error object
    const exception = error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : JSON.stringify(error));

    // Send exception telemetry to Azure Application Insights
    this.telemetry.logException(exception, LogSeverity.Critical, {
      unhandled: true,
      timestamp: new Date().toISOString()
    });
  }
}
