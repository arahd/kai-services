import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError } from 'rxjs';
import { ConfigService } from '@core/services/config.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { BaseApiService } from '@core/services/base-api.service';
import {
  PendingUser,
  RegisteredUser,
  ApprovePayload,
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
export class AdminApiService extends BaseApiService {
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

  // --- Admin/User Management ---

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
    return this.get<UserManagementResponse>(`/kai-admin/user-management/users?${qs.toString()}`);
  }

  /** GET /kai-admin/user-management/summary */
  getUserManagementSummary(): Observable<UserManagementSummaryResponse> {
    return this.get<UserManagementSummaryResponse>('/kai-admin/user-management/summary');
  }

  /** POST /reporting/user-management/update-user */
  updateUserManagement(payload: UpdateUserPayload): Observable<UpdateUserResponse> {
    return this.post<UpdateUserResponse>('/kai-admin/user-management/update-user', payload);
  }

  /** POST /reporting/user-management/reset-tokens */
  resetUserTokens(payload: ResetTokensPayload): Observable<ResetTokensResponse> {
    return this.post<ResetTokensResponse>('/kai-admin/user-management/reset-tokens', payload);
  }

  // --- Teams Dashboard & CRUD APIs (Task 915) ---

  /** GET /user-management/teams */
  getTeams(): Observable<TeamsListResponse> {
    return this.get<TeamsListResponse>('/kai-admin/user-management/teams');
  }

  /** GET /user-management/team-members?group_id=... */
  getTeamMembers(groupId: number): Observable<TeamMembersResponse> {
    return this.get<TeamMembersResponse>(`/kai-admin/user-management/team-members?group_id=${groupId}`);
  }

  /** POST /user-management/team/create */
  createTeam(payload: CreateTeamPayload): Observable<TeamMutationResponse> {
    return this.post<TeamMutationResponse>('/kai-admin/user-management/team/create', payload);
  }

  /** POST /user-management/team/update */
  updateTeam(payload: UpdateTeamPayload): Observable<TeamMutationResponse> {
    return this.post<TeamMutationResponse>('/kai-admin/user-management/team/update', payload);
  }

  /** POST /user-management/team/delete */
  deleteTeam(groupId: number): Observable<DeleteTeamResponse> {
    return this.post<DeleteTeamResponse>('/kai-admin/user-management/team/delete', { group_id: groupId });
  }

  /** POST /user-management/team/add-members */
  addTeamMembers(payload: TeamMembersMutationPayload): Observable<TeamMembersMutationResponse> {
    return this.post<TeamMembersMutationResponse>('/kai-admin/user-management/team/add-members', payload);
  }

  /** POST /user-management/team/remove-members */
  removeTeamMembers(payload: TeamMembersMutationPayload): Observable<TeamMembersMutationResponse> {
    return this.post<TeamMembersMutationResponse>('/kai-admin/user-management/team/remove-members', payload);
  }

  getPendingUserDetails(): Observable<PendingUser[]> {
    return this.get<PendingUser[]>('/kai-admin/get-pending-user-details');
  }

  getRegisteredUserDetails(): Observable<RegisteredUser[]> {
    return this.get<RegisteredUser[]>('/kai-admin/get-registered-user-details');
  }

  approveAccess(payload: ApprovePayload): Observable<any> {
    return this.post<any>('/kai-admin/approve-access', payload);
  }

  // --- Model Management ---

  getAvailableModels(): Observable<string[]> {
    return this.get<string[]>('/auth/get-models');
  }

  updateUserLatestModel(payload: { userId: string; default_model: string; latest_model: string }): Observable<any> {
    return this.post<any>('/auth/user-latest-model', payload);
  }

  fetchUserLatestModel(userId: string): Observable<any> {
    return this.post<any>('/auth/fetch-latest-model', { userId });
  }

  // --- User Access Controls ---

  unblockUser(userId: string): Observable<any> {
    return this.post<any>('/auth/unblock-user', { user_id: userId });
  }

  blockUser(userId: string): Observable<any> {
    return this.post<any>('/auth/block-user', { user_id: userId });
  }

  revokeUser(data: any): Observable<any> {
    return this.post<any>('/auth/revoke_user', data);
  }

  activateUser(data: any): Observable<any> {
    return this.post<any>('/auth/activate_user', data);
  }

  resetApiUser(payload: { username: string; project_id: string }): Observable<any> {
    return this.post<any>('/auth/reset-api-user', payload);
  }

  createClientSecret(payload: {
    username: string;
    bot_type: string;
    project_id: string;
  }): Observable<any> {
    return this.post<any>('/auth/api-secret', payload);
  }

  // --- Auth APIs ---

  sendTokenToBackend(payload: any): Observable<any> {
    return this.http.get<any>(`${this.getBaseUrl()}/auth/login`);
  }

  requestAccess(payload: any): Observable<any> {
    return this.post<any>('/auth/request-access', payload);
  }

  // --- Sensitive Search Controls ---

  setSensitiveQuestionsAllowance(userId: string, allow: boolean): Observable<any> {
    return this.post<any>('/auth/update-allow-sensitive', {
      allow_sensitive_search: allow,
      userId,
    });
  }

  getSensitiveQuestionsAllowance(userId: string): Observable<boolean> {
    return this.post<any>('/auth/allow-sensitive', { userId }).pipe(
      map(res => this.normalizeAllowSensitiveResponse(res))
    );
  }

  /** POST /auth/users/search?query= — token usage user search (returns usage rows). */
  searchTokenUsageUsers(query: string): Observable<any> {
    const encoded = encodeURIComponent(query.trim());
    return this.post<any>(`/auth/users/search?query=${encoded}`, {});
  }

  /** POST /auth/users/sorted?sort_by=&order=&page= — paginated sorted token usage rows. */
  getSortedTokenUsageUsers(params: {
    sort_by: string;
    order: 'asc' | 'desc';
    page: number;
  }): Observable<any> {
    const qs = new URLSearchParams({
      sort_by: params.sort_by,
      order: params.order,
      page: String(params.page),
    });
    return this.post<any>(`/auth/users/sorted?${qs.toString()}`, {});
  }

  /** GET admin/privacy-policy (falls back to /privacy-policy) */
  getPrivacyPolicy(): Observable<any> {
    return this.get<any>('/kai-admin/privacy-policy')
  }

  private normalizeAllowSensitiveResponse(res: any): boolean {
    if (typeof res === 'boolean') return res;
    if (!res || typeof res !== 'object') return false;
    const candidates = [
      res.allow_sensitive_search,
      res.allowSensitiveSearch,
      res.allowSensitive,
      res.allowed,
      res.enabled,
      res.status,
      res.data?.allow_sensitive_search,
      res.data?.allowSensitiveSearch,
      res.data?.allowSensitive,
      res.data?.allowed,
      res.data?.enabled,
    ];
    const v = candidates.find((x) => x !== undefined);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.toLowerCase();
      if (s === 'allowed' || s === 'true' || s === 'enabled') return true;
      if (s === 'restricted' || s === 'false' || s === 'disabled') return false;
    }
    return false;
  }
}
