import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ConfigService } from '@core/services/config.service';
import { Observable } from 'rxjs';

export interface DocumentFormatIssueItem {
  type: string;
  detected?: string | number;
  detected_font_family?: string;
  detected_font_size?: string | number;
  detected_footer_font_family?: string;
  detected_alignment_issue?: string;
  detected_Paragraph_Spacing_issue?: string;
  expected_font_family?: string;
  expected_font_size?: string | number;
  text_with_issue?: string;
  issue?: string;
}

export interface DocumentFormatIssue {
  document_name: string;
  document_type: string; // 'letter' | 'resume'
  is_corupted?: boolean;
  is_corrupted?: boolean;
  issues: DocumentFormatIssueItem[];
  is_pdf?: boolean;
}

export interface DocumentInconsistencyItem {
  issue?: string;
  inconsistency?: string;
  documents_involved?: string[];
  description?: string;
}

export interface MissingContentItem {
  inconsistency?: string;
  issue?: string;
  present_in?: string[];
  missing_from?: string[];
  documents_involved?: string[];
  description?: string;
}

export interface GrammaticalIssueItem {
  issue: string;
  documents_involved?: string[];
  description: string;
}

export interface MiscellaneousIssueItem {
  issue: string;
  documents_involved?: string[];
  description: string;
}

export interface DocumentContentIssues {
  profile_type?: string;
  document_inconsistency?: DocumentInconsistencyItem[];
  missing_items?: (MissingContentItem | string)[];
  grammatical?: GrammaticalIssueItem[];
  miscellaneous?: MiscellaneousIssueItem[];
}

export interface VisaProcessResponse {
  success: boolean;
  email_id?: string;
  process?: string;
  type_of_visa_process?: string;
  token_used?: number;
  profile_type?: string;
  document_format_issues?: DocumentFormatIssue[];
  document_content_issues?: DocumentContentIssues;
  document_inconsistency?: DocumentContentIssues;
  visa_process_status?: DocumentContentIssues | { missing_items?: string[] };
}

@Injectable({ providedIn: 'root' })
export class VisaProcessService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  /**
   * Send the resume and employment letters to be processed/verified.
   * POST /api/visa/process
   * FormData fields:
   *   type_of_visa_process (business | ict | extension)
   *   resume_file
   *   indian_letter_file (optional)
   *   canada_letter_file (optional)
   */
  processVisa(
    typeOfVisaProcess: string,
    resumeFile: File,
    indianLetterFile: File | null,
    canadaLetterFile: File | null,
  ): Observable<HttpEvent<VisaProcessResponse>> {
    const apiUrl = `${this.configService.getHrPortalUrl()}/visa/process`;
    const fd = new FormData();
    fd.append('type_of_visa_process', typeOfVisaProcess);
    fd.append('resume_file', resumeFile);
    if (indianLetterFile) {
      fd.append('indian_letter_file', indianLetterFile);
    }
    if (canadaLetterFile) {
      fd.append('canada_letter_file', canadaLetterFile);
    }

    return this.http.post<VisaProcessResponse>(apiUrl, fd, {
      reportProgress: true,
      observe: 'events',
    });
  }
}
