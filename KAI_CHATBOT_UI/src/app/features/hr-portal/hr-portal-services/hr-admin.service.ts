import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { Observable } from 'rxjs';
import {
  CreateHrUserDto,
  HrApiResponse,
  HrUsersListResponse,
  UpdateHrUserDto,
} from '../models/hr-access.model';

@Injectable({ providedIn: 'root' })
export class HrAdminService {
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
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  /**
   * Get all registered HR users and their permissions
   * GET /hr/get-users
   */
  getUsers(): Observable<HrUsersListResponse> {
    const url = this.getApiUrl('/hr/get-users');
    return this.http.get<HrUsersListResponse>(url, { headers: this.getAuthHeaders() });
  }

  /**
   * Create a new user with granular permissions
   * POST /hr/create-user
   */
  createUser(payload: CreateHrUserDto): Observable<HrApiResponse> {
    const url = this.getApiUrl('/hr/create-user');
    return this.http.post<HrApiResponse>(url, payload, { headers: this.getAuthHeaders() });
  }

  /**
   * Update an existing user's permissions and details
   * PUT /hr/users/{user_id}
   */
  updateUser(userId: number, payload: UpdateHrUserDto): Observable<HrApiResponse> {
    const url = this.getApiUrl(`/hr/users/${userId}`);
    return this.http.put<HrApiResponse>(url, payload, { headers: this.getAuthHeaders() });
  }

  /**
   * Delete an HR user by ID
   * DELETE /hr/users/{user_id}
   */
  deleteUser(userId: number): Observable<HrApiResponse> {
    const url = this.getApiUrl(`/hr/users/${userId}`);
    return this.http.delete<HrApiResponse>(url, { headers: this.getAuthHeaders() });
  }
}
