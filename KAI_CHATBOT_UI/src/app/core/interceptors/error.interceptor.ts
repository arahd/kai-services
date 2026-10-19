import { Injectable, inject } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ChatErrorHandlerService } from '@core/services/error-handler.service';

/**
 * Global HTTP Error Interceptor.
 * Intercepts failed HTTP API calls and forwards telemetry to Azure Application Insights via ChatErrorHandlerService.
 */
@Injectable()
export class HttpErrorInterceptor implements HttpInterceptor {
  private readonly errorHandler = inject(ChatErrorHandlerService);

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        // Forward HTTP error to ChatErrorHandlerService for Azure Telemetry & Toast handling
        this.errorHandler.handleApiError(error);
        return throwError(() => error);
      })
    );
  }
}
