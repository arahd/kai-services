import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '@core/services/config.service';

export interface ResumeGenerateResponse {
  success: boolean;
  blob_path?: string;
  blob_path_pdf?: string;
  blob_path_docx?: string;
  missing_details?: Record<string, string>;
  extra_details?: Record<string, any>;
}

@Injectable({ providedIn: 'root' })
export class ResumeStandardizerService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  /**
   * Upload a resume file for standardization.
   * POST /api/generate/resume
   * FormData field: resume_file
   */
  generateResume(resumeFile: File, templateFile?: File): Observable<HttpEvent<ResumeGenerateResponse>> {
    const apiUrl = `${this.configService.getHrPortalUrl()}/generate/resume/db`;
    const fd = new FormData();
    fd.append('resume_file', resumeFile);
    if (templateFile) {
      fd.append('template_file', templateFile);
    }

    return this.http.post<ResumeGenerateResponse>(apiUrl, fd, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /**
   * Download the standardized resume PDF.
   * GET /api/resume/download/<blob_key>
   */
  downloadResume(blobKey: string): Observable<any> {
    const apiUrl = `${this.configService.getHrPortalUrl()}/resume_db/download/${blobKey}`;
    return this.http.get(apiUrl, {
      responseType: 'blob' as 'json',
      observe: 'response',
    });
  }
}
