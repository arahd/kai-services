import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import { ConfigService } from '@core/services/config.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { BaseApiService } from '@core/services/base-api.service';
import {
  UserManagementQueryParams,
  UserManagementResponse,
  UserManagementSummaryResponse,
  UpdateUserPayload,
  UpdateUserResponse,
  ResetTokensPayload,
  ResetTokensResponse,
  TeamRecord,
  TeamsListResponse,
  TeamMembersResponse,
  CreateTeamPayload,
  UpdateTeamPayload,
  TeamMutationResponse,
  DeleteTeamResponse,
  TeamMembersMutationPayload,
  TeamMembersMutationResponse
} from '@shared/models';

@Injectable({ providedIn: 'root' })
export class ReportingApiService extends BaseApiService {
  protected readonly http = inject(HttpClient);
  protected readonly configService = inject(ConfigService);
  protected readonly azureAdService = inject(AzureAdService);

  protected getBaseUrl(): string {
    // When running locally on localhost, return empty string so requests hit the
    // Angular CLI dev proxy (proxy.conf.json) and avoid CORS errors
    // if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    //   return '';
    // }
    return this.configService.getAzureUrl();
  }

  // --- Reporting APIs ---

  getReportingAnalytics(payload: any): Observable<any> {
    return this.post<any>('/reporting/analytics', payload);
  }

  getUserAnalytics(payload: any): Observable<any> {
    return this.post<any>('/reporting/get/user/analytics', payload);
  }

  searchReportingUsers(payload: any): Observable<any> {
    return this.post<any>('/reporting/get/user', payload);
  }

  getReportingModels(payload: any): Observable<any> {
    return this.post<any>('/reporting/get/models', payload);
  }

  getModelUsage(payload: any): Observable<any> {
    return this.post<any>('/reporting/get/model/usage', payload);
  }

  getReportSummary(payload: any): Observable<any> {
    return this.post<any>('/reporting/apiuser/report/summary', payload);
  }

  getProjectList(payload: any): Observable<any> {
    return this.post<any>('/reporting/api/report/projects', payload);
  }

  getUserProjectList(payload: any): Observable<any> {
    return this.post<any>('/reporting/apiuser/report/projects', payload);
  }

  getMaxTokensUsed(payload: any): Observable<any> {
    return this.post<any>('/reporting/apiuser/report/max_tokens_used', payload);
  }

  getMinTokensUsed(payload: any): Observable<any> {
    return this.post<any>('/reporting/apiuser/report/min_tokens_used', payload);
  }

  getProjectNames(payload: any): Observable<any> {
    return this.post<any>('/reporting/apiuser/report/projectlist', payload);
  }

  getUsernames(payload: any): Observable<any> {
    return this.post<any>('/reporting/apiuser/report/usernames', payload);
  }

  getUserDetails(payload: any): Observable<any> {
    return this.post<any>('/reporting/apiuser/report/user_details', payload);
  }

  getUsersByProject(payload: any): Observable<any> {
    return this.post<any>('/reporting/apiuser/report/users_by_project', payload);
  }

  getRevokedUsers(payload: any): Observable<any> {
    return this.post<any>('/reporting/api/report/revoked', payload);
  }

  getFilterProjectIds(payload: any): Observable<any> {
    return this.post<any>('/reporting/api/report/projectlist', payload);
  }

  searchFilterUsernames(payload: any): Observable<any> {
    return this.post<any>('/reporting/api/report/usernames', payload);
  }

  getApiUserReportDetails(payload: any): Observable<any> {
    return this.post<any>('/reporting/api/report/user_details', payload);
  }

  getOverallTokensUsage(payload: { bot_type: string }): Observable<any> {
    return this.post<any>('/reporting/api/report/overall_tokens_usage', payload);
  }

  // --- Bug Reporting APIs ---

  createBugReport(formData: FormData): Observable<any> {
    // Note: Bug report upload doesn't use the standard JSON POST because it needs FormData
    // Since it goes to a different endpoint structure we handle it explicitly here
    const url = `${this.getBaseUrl()}/reporting/create_bug_sheet`;
    return this.http.post<any>(url, formData);
  }

  getBugReports(payload: any): Observable<any> {
    return this.post<any>('/reporting/get_bug_reports', payload);
  }

  updateBugStatus(payload: { ticket_number: string; state: string }): Observable<any> {
    return this.put<any>('/reporting/update_bug_status', payload);
  }

  getBugAttachment(payload: { attachment_id: number }): Observable<any> {
    return this.post<any>('/reporting/get_bug_attachment', payload);
  }

  // --- User Management APIs ---

  /** GET /reporting/user-management/users with query params: page, page_size, search, access */
  getUserManagementUsers(params: UserManagementQueryParams): Observable<UserManagementResponse> {
    const qs = new URLSearchParams({
      page: String(params.page),
      page_size: String(params.page_size),
    });
    if (params.search?.trim()) {
      qs.set('search', params.search.trim());
    }
    if (params.access) {
      qs.set('access', params.access);
    }
    if (params.role) {
      qs.set('role', params.role);
    }
    return this.get<UserManagementResponse>(`/reporting/user-management/users?${qs.toString()}`);
  }

  /** GET /reporting/user-management/summary */
  getUserManagementSummary(): Observable<UserManagementSummaryResponse> {
    return this.get<UserManagementSummaryResponse>('/reporting/user-management/summary');
  }

  /** POST /reporting/user-management/update-user */
  updateUserManagement(payload: UpdateUserPayload): Observable<UpdateUserResponse> {
    return this.post<UpdateUserResponse>('/reporting/user-management/update-user', payload);
  }

  /** POST /reporting/user-management/reset-tokens */
  resetUserTokens(payload: ResetTokensPayload): Observable<ResetTokensResponse> {
    return this.post<ResetTokensResponse>('/reporting/user-management/reset-tokens', payload);
  }

  // --- Teams Dashboard & CRUD APIs (Task 915) ---

  /** GET /reporting/user-management/teams */
  getTeams(): Observable<TeamsListResponse> {
    return this.get<TeamsListResponse>('/reporting/user-management/teams');
  }

  /** GET /reporting/user-management/team-members?group_id=... */
  getTeamMembers(groupId: number): Observable<TeamMembersResponse> {
    return this.get<TeamMembersResponse>(`/reporting/user-management/team-members?group_id=${groupId}`);
  }

  /** POST /reporting/user-management/team/create */
  createTeam(payload: CreateTeamPayload): Observable<TeamMutationResponse> {
    return this.post<TeamMutationResponse>('/reporting/user-management/team/create', payload);
  }

  /** POST /reporting/user-management/team/update */
  updateTeam(payload: UpdateTeamPayload): Observable<TeamMutationResponse> {
    return this.post<TeamMutationResponse>('/reporting/user-management/team/update', payload);
  }

  /** POST /reporting/user-management/team/delete */
  deleteTeam(groupId: number): Observable<DeleteTeamResponse> {
    return this.post<DeleteTeamResponse>('/reporting/user-management/team/delete', { group_id: groupId });
  }

  /** POST /reporting/user-management/team/add-members */
  addTeamMembers(payload: TeamMembersMutationPayload): Observable<TeamMembersMutationResponse> {
    return this.post<TeamMembersMutationResponse>('/reporting/user-management/team/add-members', payload);
  }

  /** POST /reporting/user-management/team/remove-members */
  removeTeamMembers(payload: TeamMembersMutationPayload): Observable<TeamMembersMutationResponse> {
    return this.post<TeamMembersMutationResponse>('/reporting/user-management/team/remove-members', payload);
  }

  // --- Export APIs ---

  private readonly xlsxMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  private async readExportXlsxBlob(resp: Response): Promise<Blob> {
    if (!resp.ok) {
      let message = `Export failed (${resp.status})`;
      try {
        const text = await resp.text();
        if (text) {
          try {
            const json = JSON.parse(text);
            message = json.detail ?? json.message ?? message;
          } catch {
            message = text.slice(0, 200);
          }
        }
      } catch {}
      throw new Error(message);
    }

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    const raw = await resp.blob();

    if (raw.size === 0) {
      throw new Error('Export returned empty file');
    }

    if (contentType.includes('json') || raw.type.toLowerCase().includes('json')) {
      const text = await raw.text();
      let message = 'Export failed';
      try {
        const json = JSON.parse(text);
        message = json.detail ?? json.message ?? message;
      } catch {
        if (text.trim()) message = text.slice(0, 200);
      }
      throw new Error(message);
    }

    return new Blob([await raw.arrayBuffer()], { type: this.xlsxMimeType });
  }

  exportAllUsersXlsx(payload: any): Observable<Blob> {
    return this.postForRawResponse('/reporting/get/user/all', payload).pipe(
      switchMap(resp => from(this.readExportXlsxBlob(resp)))
    );
  }

  exportQuestionsXlsx(payload: any): Observable<Blob> {
    return this.postForRawResponse('/reporting/get/questions', payload).pipe(
      switchMap(resp => from(this.readExportXlsxBlob(resp))),
      switchMap(blob => from(this.dedupeQuestionsExportByQuestionColumn(blob)))
    );
  }

  exportReportQuestionsXlsx(payload: any): Observable<Blob> {
    return this.postForRawResponse('/reporting/api/report/question', payload).pipe(
      switchMap(resp => from(this.readExportXlsxBlob(resp)))
    );
  }

  private async dedupeQuestionsExportByQuestionColumn(blob: Blob): Promise<Blob> {
    try {
      const buf = await blob.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return blob;

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][];
      if (rows.length < 2) return blob;

      const header = rows[0].map((cell) => String(cell ?? '').trim());
      const questionIdx = header.findIndex((col) => col.toLowerCase() === 'question' || col.toLowerCase() === 'user query');
      if (questionIdx < 0) return blob;

      const seen = new Set<string>();
      const deduped: unknown[][] = [rows[0]];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const val = String(row[questionIdx] ?? '').trim().toLowerCase();
        if (val === '') {
          deduped.push(row);
        } else if (!seen.has(val)) {
          seen.add(val);
          deduped.push(row);
        }
      }

      if (deduped.length === rows.length) return blob;

      const newWs = XLSX.utils.aoa_to_sheet(deduped);
      const newWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
      const outBuf = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
      return new Blob([outBuf], { type: this.xlsxMimeType });
    } catch (err) {
      console.warn('Failed to dedupe export spreadsheet:', err);
      return blob;
    }
  }
}
