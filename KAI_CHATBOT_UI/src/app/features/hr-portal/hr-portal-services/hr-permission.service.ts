import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { Observable, tap, of, catchError } from 'rxjs';
import { HrUserAccess } from '../models/hr-access.model';

@Injectable({ providedIn: 'root' })
export class HrPermissionService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private storageService = inject(SessionStorageService);
  private tokenService = inject(TokenService);

  readonly currentUserAccess = signal<HrUserAccess | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly isLoaded = signal<boolean>(false);

  readonly isAdmin = computed(() => {
    const access = this.currentUserAccess();
    if (access && typeof access.is_admin === 'boolean') {
      return access.is_admin;
    }
    return false;
  });

  readonly canAccessResumeModule = computed(() => {
    const access = this.currentUserAccess();
    if (!access) return false;
    return !!(access.resume_internal || access.resume_offshore || access.resume_onsite);
  });

  readonly canAccessVisaModule = computed(() => {
    const access = this.currentUserAccess();
    if (!access) return false;
    return !!(access.visa_business || access.visa_ict || access.visa_extension);
  });

  private getApiUrl(endpoint: string): string {
    const baseUrl = (this.configService.getHrPortalUrl() || '').replace(/\/$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseUrl}${cleanEndpoint}`;
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.tokenService.getToken() || this.storageService.getJwtToken() || '';
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  loadAccessControl(forceRefresh = false): Observable<HrUserAccess | null> {
    if (this.isLoaded() && !forceRefresh && this.currentUserAccess()) {
      return of(this.currentUserAccess());
    }

    const isHrAdmin = this.tokenService.isHrAdmin();
    if (!isHrAdmin) {
      const fallback: HrUserAccess = {
        email_id: this.tokenService.getUserInfo()?.email || '',
        user_name: this.tokenService.getUserInfo()?.name || '',
        is_admin: false,
        resume_internal: false,
        resume_offshore: false,
        resume_onsite: false,
        visa_business: false,
        visa_extension: false,
        visa_ict: false,
        success: false,
      };
      this.currentUserAccess.set(fallback);
      this.isLoaded.set(true);
      this.isLoading.set(false);
      return of(fallback);
    }

    this.isLoading.set(true);
    const url = this.getApiUrl('/hr/access-control');

    return this.http.get<HrUserAccess>(url, { headers: this.getAuthHeaders() }).pipe(
      tap((res) => {
        this.currentUserAccess.set(res);
        this.isLoaded.set(true);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        console.error('[HrPermissionService] Error loading access control:', err);
        this.isLoading.set(false);
        // Fallback default access if API fails
        const fallback: HrUserAccess = {
          email_id: this.tokenService.getUserInfo()?.email || '',
          user_name: this.tokenService.getUserInfo()?.name || '',
          is_admin: false,
          resume_internal: false,
          resume_offshore: false,
          resume_onsite: false,
          visa_business: false,
          visa_extension: false,
          visa_ict: false,
          success: false,
        };
        this.currentUserAccess.set(fallback);
        this.isLoaded.set(true);
        return of(fallback);
      })
    );
  }

  hasVisaAccess(type: 'business' | 'ict' | 'extension'): boolean {
    const access = this.currentUserAccess();
    if (!access) return false;
    switch (type) {
      case 'business':
        return !!access.visa_business;
      case 'ict':
        return !!access.visa_ict;
      case 'extension':
        return !!access.visa_extension;
      default:
        return false;
    }
  }

  hasAnyVisaAccess(): boolean {
    const access = this.currentUserAccess();
    if (!access) return false;
    return !!(access.visa_business || access.visa_ict || access.visa_extension);
  }

  hasResumeAccess(type: 'internal' | 'offshore' | 'onsite'): boolean {
    const access = this.currentUserAccess();
    if (!access) return false;
    switch (type) {
      case 'internal':
        return !!access.resume_internal;
      case 'offshore':
        return !!access.resume_offshore;
      case 'onsite':
        return !!access.resume_onsite;
      default:
        return false;
    }
  }

  hasAnyResumeAccess(): boolean {
    const access = this.currentUserAccess();
    if (!access) return false;
    return !!(access.resume_internal || access.resume_offshore || access.resume_onsite);
  }
}
