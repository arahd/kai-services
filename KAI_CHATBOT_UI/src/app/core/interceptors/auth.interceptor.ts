import { Injectable, inject } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { TokenService } from '@core/services/token.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { SessionStorageService } from '@core/services/session-storage.service';
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly tokenService = inject(TokenService);
  private readonly azureAdService = inject(AzureAdService);
  private readonly router = inject(Router);
  private readonly storageService = inject(SessionStorageService);

  private redirectingToLogin = false;

  private forceLogoutToLogin(reason?: unknown) {
    if (this.redirectingToLogin) return;
    this.redirectingToLogin = true;

    try {
      this.tokenService.clearToken();
      this.storageService.clear();
    } catch {
      // no-op
    }

    // Best-effort: also clear MSAL cached account (localStorage) to avoid
    // re-hydrating a stale "logged-in" user on refresh.
    this.azureAdService.logout().catch(() => {
      // ignore
    });

    // If logoutRedirect doesn't happen (blocked), at least go to login route.
    if (this.router.url !== '/login') {
      this.router.navigate(['/login']);
    }
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.tokenService.getToken();

    // Attach token if available
    const authReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

   return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // If unauthorized, try refreshing token once
        if (error.status === 401) {
          console.warn('Access token may be expired — refreshing token...');

          return from(this.azureAdService.getValidToken(true)).pipe(
            switchMap((newToken: string) => {

              // Save the refreshed token
              this.tokenService.setToken(newToken);

              // Retry the original request with the new token
              const retryReq = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` }
              });

              return next.handle(retryReq).pipe(
                catchError((retryErr: HttpErrorResponse) => {
                  if (retryErr.status === 401) {
                    this.forceLogoutToLogin(retryErr);
                  }
                  return throwError(() => retryErr);
                })
              );
            }),
            catchError(err => {
              console.error('Token refresh failed — forcing logout', err);
              this.forceLogoutToLogin(err);
              return throwError(() => err);
            })
          );
        }

        // Pass through other errors
        return throwError(() => error);
      })
    );
  }
}
