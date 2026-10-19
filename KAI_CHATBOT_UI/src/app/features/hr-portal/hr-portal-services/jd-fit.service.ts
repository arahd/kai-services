import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ConfigService } from '@core/services/config.service';
import { FailedResume } from '../pages/resume-dashboard/resume-dashboard.model';

export interface ResumeState {
  status: 'INITIAL' | 'PENDING' | 'SUCCESS' | 'FAILURE' | string;
  data: any | null;
  blobKey: string;
  error?: string;
  viewMode?: 'upload' | 'multiple-results' | 'single-result';
  multiUploadSummary?: any | null;
  failedResumes?: FailedResume[];
}

interface uploadResponse {
  data: any;
}

@Injectable({ providedIn: 'root' })
export class JdFitService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private router = inject(Router);

  private readonly defaultState: ResumeState = {
    status: 'INITIAL',
    data: null,
    blobKey: '',
    viewMode: 'upload',
    multiUploadSummary: null,
    failedResumes: [],
  };

  private readonly _resumeState = signal<ResumeState>({
    ...this.defaultState,
  });
  readonly resumeState = this._resumeState.asReadonly();
  readonly resumeData$ = toObservable(this._resumeState);

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

  uploadFiles(resume: File, jd: File, candidate: string): Observable<HttpEvent<uploadResponse>> {
    const apiUrl = `${this.configService.getHrPortalUrl()}/assess/jd-fit`;

    return this.http.post<uploadResponse>(
      apiUrl,
      this.buildForm(resume, jd, candidate),
      { reportProgress: true, observe: 'events' },
    );
  }

  uploadMultipleFiles(resumes: File[], jd: File): Observable<HttpEvent<any>> {
    const apiUrl = `${this.configService.getHrPortalUrl()}/assess/jd-fit-multiple`;
    const fd = new FormData();
    fd.append('jd_pdf', jd);
    resumes.forEach((file) => {
      fd.append('resumes[]', file);
    });

    return this.http.post<any>(
      apiUrl,
      fd,
      { reportProgress: true, observe: 'events' },
    );
  }

  setResumeState({
    status,
    data,
    blobKey,
    error,
    viewMode,
    multiUploadSummary,
    failedResumes,
  }: ResumeState) {
    const current = this._resumeState();
    const next: ResumeState = {
      status,
      data,
      blobKey,
      error,
      viewMode: viewMode !== undefined ? viewMode : current.viewMode,
      multiUploadSummary:
        multiUploadSummary !== undefined
          ? multiUploadSummary
          : current.multiUploadSummary,
      failedResumes:
        failedResumes !== undefined
          ? failedResumes
          : (current.failedResumes ?? []),
    };
    this._resumeState.set(next);
  }

  reset() {
    this._resumeState.set({ ...this.defaultState });
  }

  private buildForm(resume: File, jd: File, candidate: string) {
    const fd = new FormData();
    fd.append('resume_pdf', resume);
    fd.append('jd_pdf', jd);
    fd.append('candidate', candidate);
    return fd;
  }

  downloadJdFit(blobKey: string) {
    const apiUrl = `${this.configService.getHrPortalUrl()}/fitment-report/download/${blobKey}`;
    return this.http.get(
      apiUrl,
      {
        responseType: 'blob' as 'json',
        observe: 'response',
      },
    );
  }

  retrieveBlobData(blobKey: string): Observable<any> {
    const apiUrl = `${this.configService.getHrPortalUrl()}/assess/retrieve_blob_data/${blobKey}`;
    return this.http.get<any>(apiUrl);
  }
}
