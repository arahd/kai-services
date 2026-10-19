import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { getUserTimezone } from '@core/utils/timezone.util';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export function extractUploadedFileList(value: any): string[] {
  if (!value || value === '-') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => String(v).trim()).filter(Boolean);
        }
      } catch {
        // ignore and fallback
      }
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [String(value)];
}

export interface HistoryRecordDto {
  id: number | string;
  date_time: string;
  email_id?: string;
  token_used?: number;
  module?: string;
  process_type?: string;
  uploaded_file_name?: string | string[] | null;
  downloaded_file_name?: string | null;
  download_url?: string | null;
  upload_status?: string | null;
  download_resume_status?: string | null;
  upload_visa_status?: string | null;
  download_visa_status?: string | null;
  status?: string | null;
  validation_score?: number | string | null;
}

export interface HrHistoryApiResponse {
  success: boolean;
  count?: number;
  total_count?: number;
  total_pages?: number;
  page?: number;
  page_size?: number;
  data: HistoryRecordDto[];
}

export interface HistoryRecordUI {
  id: string | number;
  date: string;
  time: string;
  dateTime: string;
  user: string;
  userPrefix: string;
  userDomain: string;
  tokenUsed: number;
  module: string;
  processType: string;
  uploadedFileName: string;
  uploadedFiles: string[];
  downloadedFileName: string;
  downloadUrl: string;
  uploadStatus: 'Success' | 'Failed' | string;
  downloadStatus: 'Success' | 'Failed' | '-';
}

@Injectable({
  providedIn: 'root',
})
export class HrHistoryService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private storageService = inject(SessionStorageService);
  private tokenService = inject(TokenService);

  private getApiUrl(endpoint: string): string {
    const baseUrl = (this.configService.getHrPortalUrl() || '').replace(/\/$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseUrl}${cleanEndpoint}`;
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.tokenService.getToken() || this.storageService.getJwtToken() || '';
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Timezone': getUserTimezone(),
    });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  /**
   * Fetch standard HR user history with API pagination
   * GET /hr/history?Page=1&page=1&page_size=20
   * Filters supported: email_id, module, process_type, from_date, to_date
   */
  getHistory(
    pageOrFilters?: number | any,
    pageSize: number = 20,
    filters?: any,
  ): Observable<HrHistoryApiResponse> {
    let page = 1;
    let actualFilters = filters;

    if (typeof pageOrFilters === 'number') {
      page = pageOrFilters;
    } else if (pageOrFilters && typeof pageOrFilters === 'object') {
      actualFilters = pageOrFilters;
      if (typeof pageOrFilters.page === 'number') page = pageOrFilters.page;
      if (typeof pageOrFilters.Page === 'number') page = pageOrFilters.Page;
      if (typeof pageOrFilters.pageSize === 'number') pageSize = pageOrFilters.pageSize;
      if (typeof pageOrFilters.page_size === 'number') pageSize = pageOrFilters.page_size;
    }

    const url = this.getApiUrl('/hr/history');
    let params = new HttpParams()
      .set('page', String(page))
      .set('Page', String(page))
      .set('page_size', String(pageSize))
      .set('tz', getUserTimezone());

    if (actualFilters) {
      if (actualFilters.email_id && actualFilters.email_id !== 'all' && actualFilters.email_id !== 'All Users') {
        params = params.set('email_id', actualFilters.email_id);
      } else if (actualFilters.user && actualFilters.user !== 'all' && actualFilters.user !== 'All Users') {
        params = params.set('email_id', actualFilters.user);
      }
      if (actualFilters.module && actualFilters.module !== 'all' && actualFilters.module !== 'All Modules') {
        params = params.set('module', actualFilters.module);
      }
      if (actualFilters.process_type && actualFilters.process_type !== 'all' && actualFilters.process_type !== 'All Process Types') {
        params = params.set('process_type', actualFilters.process_type);
      }
      if (actualFilters.from_date) {
        params = params.set('from_date', actualFilters.from_date);
      }
      if (actualFilters.to_date) {
        params = params.set('to_date', actualFilters.to_date);
      }
    }

    return this.http.get<HrHistoryApiResponse>(url, { headers: this.getAuthHeaders(), params }).pipe(
      catchError((err) => {
        console.warn('[HrHistoryService] Failed to fetch history:', err);
        return of({ success: false, count: 0, total_count: 0, data: [] });
      })
    );
  }

  /**
   * Fetch admin HR history / table view
   * GET /hr/admin/history
   */
  getAdminHistory(page: number = 1, pageSize: number = 20, filters?: any): Observable<HrHistoryApiResponse> {
    const url = this.getApiUrl('/hr/admin/history');
    let params = new HttpParams()
      .set('page', page)
      .set('page_size', pageSize)
      .set('tz', getUserTimezone());
    if (filters) {
      if (filters.email_id && filters.email_id !== 'all' && filters.email_id !== 'All Users') {
        params = params.set('email_id', filters.email_id);
      } else if (filters.user && filters.user !== 'all' && filters.user !== 'All Users') {
        params = params.set('email_id', filters.user);
      }
      if (filters.module && filters.module !== 'all' && filters.module !== 'All Modules') {
        params = params.set('module', filters.module);
      }
      if (filters.process_type && filters.process_type !== 'all' && filters.process_type !== 'All Process Types') {
        params = params.set('process_type', filters.process_type);
      }
      if (filters.from_date) {
        params = params.set('from_date', filters.from_date);
      }
      if (filters.to_date) {
        params = params.set('to_date', filters.to_date);
      }
    }

    return this.http.get<HrHistoryApiResponse>(url, { headers: this.getAuthHeaders(), params }).pipe(
      catchError((err) => {
        console.warn('[HrHistoryService] Failed to fetch admin history:', err);
        return of({ success: false, count: 0, total_count: 0, data: [] });
      })
    );
  }

  /**
   * GET /hr/history/users
   */
  getUsers(): Observable<string[]> {
    const url = this.getApiUrl('/hr/history/users');
    return this.http.get<{ success: boolean; data: string[] }>(url, { headers: this.getAuthHeaders() }).pipe(
      map((res) => (res && res.success && Array.isArray(res.data) ? res.data : [])),
      catchError(() => of([]))
    );
  }

  /**
   * GET /hr/history/modules
   */
  getModules(): Observable<string[]> {
    const url = this.getApiUrl('/hr/history/modules');
    return this.http.get<{ success: boolean; data: string[] }>(url, { headers: this.getAuthHeaders() }).pipe(
      map((res) => (res && res.success && Array.isArray(res.data) ? res.data : [])),
      catchError(() => of([]))
    );
  }

  /**
   * GET /hr/history/process-types
   */
  getProcessTypes(): Observable<string[]> {
    const url = this.getApiUrl('/hr/history/process-types');
    return this.http.get<{ success: boolean; data: string[] }>(url, { headers: this.getAuthHeaders() }).pipe(
      map((res) => (res && res.success && Array.isArray(res.data) ? res.data : [])),
      catchError(() => of([]))
    );
  }

  /**
   * Resolves a download URL/path into a fully qualified API endpoint.
   * Handles relative paths (/api/..., /resume_db/..., blob keys) and absolute URLs.
   */
  buildDownloadUrl(downloadUrl: string): string {
    if (!downloadUrl) return '';
    if (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://')) {
      return downloadUrl;
    }

    const baseUrl = (this.configService.getHrPortalUrl() || '').replace(/\/$/, '');

    // Normalize if baseUrl already ends with /api and downloadUrl starts with /api/ or api/
    if (baseUrl.endsWith('/api') && (downloadUrl.startsWith('/api/') || downloadUrl.startsWith('api/'))) {
      const cleanPath = downloadUrl.replace(/^\/?api/, '');
      return `${baseUrl}${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;
    }

    if (downloadUrl.startsWith('/')) {
      return `${baseUrl}${downloadUrl}`;
    }

    // If it's a blob key without endpoint prefix
    if (!downloadUrl.includes('/download/')) {
      return `${baseUrl}/resume_db/download/${downloadUrl}`;
    }

    return `${baseUrl}/${downloadUrl}`;
  }

  /**
   * Downloads a generated document / resume file as a binary Blob.
   * GET <resolved_download_url>
   */
  downloadFile(downloadUrl: string): Observable<HttpResponse<Blob>> {
    const url = this.buildDownloadUrl(downloadUrl);
    const token = this.tokenService.getToken() || this.storageService.getJwtToken() || '';
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return this.http.get(url, {
      headers,
      responseType: 'blob' as 'json',
      observe: 'response',
    }) as Observable<HttpResponse<Blob>>;
  }

  /**
   * Maps DTO from API to UI representation
   */
  transformToUIRecord(item: HistoryRecordDto): HistoryRecordUI {
    const rawUpload = item.upload_status || item.upload_visa_status || item.status || '';
    const rawDownload = item.download_resume_status || item.download_visa_status || '';

    let uploadStatus: 'Success' | 'Failed' | string = '-';
    if (typeof rawUpload === 'string') {
      if (rawUpload.toUpperCase() === 'SUCCESS') uploadStatus = 'Success';
      else if (rawUpload.toUpperCase() === 'FAILED') uploadStatus = 'Failed';
      else if (rawUpload) uploadStatus = rawUpload;
    }

    let downloadStatus: 'Success' | 'Failed' | '-' = '-';
    if (typeof rawDownload === 'string') {
      if (rawDownload.toUpperCase() === 'SUCCESS') downloadStatus = 'Success';
      else if (rawDownload.toUpperCase() === 'FAILED') downloadStatus = 'Failed';
      else if (rawDownload === '-') downloadStatus = '-';
    }

    const rawDateTime = item.date_time || '';
    let dateStr = rawDateTime;
    let timeStr = '';

    if (rawDateTime.includes(',')) {
      const parts = rawDateTime.split(',');
      dateStr = `${parts[0].trim()},`;
      timeStr = parts.slice(1).join(',').trim();
    } else if (rawDateTime.includes('T')) {
      try {
        const d = new Date(rawDateTime);
        const day = String(d.getDate()).padStart(2, '0');
        const month = d.toLocaleString('en-US', { month: 'short' });
        const year = d.getFullYear();
        dateStr = `${day} ${month} ${year},`;
        timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      } catch {
        dateStr = rawDateTime;
      }
    } else if (rawDateTime.includes(' ')) {
      const parts = rawDateTime.trim().split(' ');
      if (parts.length >= 4) {
        dateStr = `${parts[0]} ${parts[1]} ${parts[2]},`;
        timeStr = parts.slice(3).join(' ');
      }
    }

    const email = item.email_id || '-';
    let userPrefix = email;
    let userDomain = '';
    if (email.includes('@')) {
      const atIdx = email.indexOf('@');
      userPrefix = email.substring(0, atIdx);
      userDomain = email.substring(atIdx);
    }

    return {
      id: item.id,
      date: dateStr,
      time: timeStr,
      dateTime: rawDateTime || '-',
      user: email,
      userPrefix,
      userDomain,
      tokenUsed: item.token_used ?? 0,
      module: item.module || '-',
      processType: item.process_type || '-',
      uploadedFileName: (extractUploadedFileList(item.uploaded_file_name).join(', ')) || '-',
      uploadedFiles: extractUploadedFileList(item.uploaded_file_name),
      downloadedFileName: item.downloaded_file_name || '-',
      downloadUrl: item.download_url || '',
      uploadStatus,
      downloadStatus,
    };
  }
}
