import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { getUserTimezone } from '@core/utils/timezone.util';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  RecentActivityApiResponse,
  RecentActivityDto,
  RecentActivityPagedResult,
  RecentActivityUI,
} from './recent-activity.model';
import { extractUploadedFileList } from '../hr-history/hr-history.service';

@Injectable({
  providedIn: 'root',
})
export class RecentActivityService {
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
   * Fetch paginated recent activity for the current logged-in user
   * GET /hr/history/recent-activity?page=1&page_size=20
   */
  getUserRecentActivity(
    page: number = 1,
    pageSize: number = 20,
  ): Observable<RecentActivityPagedResult> {
    const url = this.getApiUrl('/hr/history/recent-activity');
    let params = new HttpParams()
      .set('page', String(page))
      .set('page_size', String(pageSize))
      .set('tz', getUserTimezone());

    const userInfo = this.tokenService.getUserInfo();
    const userEmail = userInfo?.email || userInfo?.preferred_username || '';
    if (userEmail) {
      params = params.set('email_id', userEmail);
    }

    return this.http
      .get<RecentActivityApiResponse>(url, {
        headers: this.getAuthHeaders(),
        params,
      })
      .pipe(
        map((res) => {
          if (res && res.success && Array.isArray(res.data)) {
            const records = res.data.map((item, idx) =>
              this.transformToUIRecord(item, (page - 1) * pageSize + idx + 1),
            );
            const totalCount = res.total_count ?? res.count ?? records.length;
            const resPage = res.page ?? page;
            const resPageSize = res.page_size ?? pageSize;
            const totalPages = Math.ceil(totalCount / resPageSize) || 1;

            return {
              records,
              totalCount,
              page: resPage,
              pageSize: resPageSize,
              totalPages,
            };
          }
          return {
            records: [],
            totalCount: 0,
            page: 1,
            pageSize,
            totalPages: 1,
          };
        }),
        catchError((err) => {
          console.warn(
            '[RecentActivityService] Failed to load user recent activity:',
            err,
          );
          return of({
            records: [],
            totalCount: 0,
            page: 1,
            pageSize,
            totalPages: 1,
          });
        }),
      );
  }

  /**
   * Resolves a download URL/path into a fully qualified API endpoint.
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
  downloadFile(downloadUrl: string): Observable<any> {
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
    });
  }

  /**
   * Transforms API DTO into structured UI model
   */
  transformToUIRecord(dto: any, fallbackId: number = 1): RecentActivityUI {
    const rawDateTime = dto.date_time || '';
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

    const rawStatus = dto.upload_status || dto.status || dto.upload_visa_status || dto.download_resume_status || '-';
    let statusText = '-';
    if (typeof rawStatus === 'string') {
      if (rawStatus.toUpperCase() === 'SUCCESS') {
        statusText = 'Success';
      } else if (rawStatus.toUpperCase() === 'FAILED') {
        statusText = 'Failed';
      } else {
        statusText = rawStatus;
      }
    }

    let scoreText = '-';
    if (dto.validation_score !== undefined && dto.validation_score !== null && dto.validation_score !== '') {
      const s = String(dto.validation_score);
      scoreText = s.endsWith('%') ? s : `${s}%`;
    }

    const files = extractUploadedFileList(dto.uploaded_file_name);
    const rawProcessType = dto.process_type || '-';
    const rawModule = dto.module || '-';

    return {
      id: dto.id ?? fallbackId,
      date: dateStr,
      time: timeStr,
      dateTimeRaw: rawDateTime,
      module: rawModule,
      processType: rawProcessType,
      uploadedFileName: files.join(', ') || '-',
      uploadedFiles: files,
      downloadedFileName: dto.downloaded_file_name || '-',
      downloadUrl: dto.download_url || '',
      status: statusText,
      validationScore: scoreText,
    };
  }
}
