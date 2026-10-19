import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService, StorageKeys } from '@core/services/session-storage.service';

export interface TLinkedInState {
  status: 'INITIAL' | 'PENDING' | 'SUCCESS' | 'FAILURE' | string;
  data: any | null;
  error?: string;
}

const LINKEDIN_STATE_STORAGE_KEY = StorageKeys.KAI_HR_LINKEDIN_STATE;

@Injectable({
  providedIn: 'root',
})
export class LinkedInValidationService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private router = inject(Router);
  private storageService = inject(SessionStorageService);

  private readonly defaultState: TLinkedInState = {
    status: 'INITIAL',
    data: null,
  };

  private readonly _linkedInValState = signal<TLinkedInState>(
    this.loadPersistedState(),
  );
  readonly linkedInValState = this._linkedInValState.asReadonly();
  readonly linkedInValData$ = toObservable(this._linkedInValState);

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe((event) => { // perf-ignore
        const url = (event.url || '').split('?')[0];
        if (!url.startsWith('/hrportal')) {
          this.reset();
        }
      });
  }

  validateLinkedInUrl(
    resume: File,
    linkedIn?: File | null,
    linkedInUrl?: string,
  ) {
    const apiUrl = `${this.configService.getHrPortalUrl()}/assess/linkedin`;

    return this.http.post<TLinkedInState>(
      apiUrl,
      this.buildForm(resume, linkedIn, linkedInUrl),
    );
  }

  setLinkedInState({ status, data, error }: TLinkedInState) {
    const next = { status, data, error };
    this._linkedInValState.set(next);
    this.persistState(next);
  }

  reset() {
    this._linkedInValState.set({ ...this.defaultState });
    this.clearPersistedState();
  }

  private loadPersistedState(): TLinkedInState {
    try {
      const raw = this.storageService.getItem(LINKEDIN_STATE_STORAGE_KEY);
      if (!raw) return { ...this.defaultState };
      const parsed = JSON.parse(raw) as TLinkedInState;
      if (
        parsed?.status === 'SUCCESS' ||
        parsed?.status === 'FAILURE'
      ) {
        return {
          status: parsed.status,
          data: parsed.data ?? null,
          error: parsed.error,
        };
      }
    } catch {
      // ignore corrupt storage
    }
    return { ...this.defaultState };
  }

  private persistState(state: TLinkedInState): void {
    try {
      if (state.status === 'SUCCESS' || state.status === 'FAILURE') {
        this.storageService.setItem(LINKEDIN_STATE_STORAGE_KEY, JSON.stringify(state));
      } else if (state.status === 'INITIAL') {
        this.clearPersistedState();
      }
    } catch {
      // ignore quota / private-mode errors
    }
  }

  private clearPersistedState(): void {
    try {
      this.storageService.removeItem(LINKEDIN_STATE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private buildForm(
    resume: File,
    linkedIn?: File | null,
    linkedInUrl?: string,
  ) {
    const fd = new FormData();
    fd.append('resume_pdf', resume);
    if (linkedIn) fd.append('linkedin_pdf', linkedIn);
    if (linkedInUrl) fd.append('linkedin_url', linkedInUrl);
    return fd;
  }
}
