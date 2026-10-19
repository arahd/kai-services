import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import {
  GetProductUserPayload,
  ProductUserDetailResponse,
  ProductUsersListResponse,
  UpdateProductUserPayload,
} from '../models/product-admin.model';

@Injectable({
  providedIn: 'root',
})
export class ProductAdminApiService {
  private readonly http = inject(HttpClient);
  private readonly configService = inject(ConfigService);
  private readonly storageService = inject(SessionStorageService);
  private readonly tokenService = inject(TokenService);
  private readonly azureAdService = inject(AzureAdService, { optional: true });

  private getBaseUrl(): string {
    return (this.configService.getAzureUrl() || this.configService.getChatbotUrl() || '').replace(/\/$/, '');
  }

  private getAuthHeaders(includeContentType: boolean = false): HttpHeaders {
    const token = this.tokenService.getToken() || this.storageService.getJwtToken() || '';
    let headers = new HttpHeaders().set('Accept', 'application/json, text/plain, */*');
    if (includeContentType) {
      headers = headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  /**
   * GET /auth/auth
   * Authenticates user token and fetches current user, roles, and product_roles.
   */
  getAuth(): Observable<any> {
    const prepareAuth = async (): Promise<string> => {
      if (typeof this.configService?.loadConfig === 'function') {
        try {
          await this.configService.loadConfig();
        } catch {
          // ignore
        }
      }

      let token = this.tokenService.getToken() || this.storageService.getJwtToken() || '';
      if (this.azureAdService && typeof this.azureAdService.getValidToken === 'function') {
        try {
          const freshToken = await this.azureAdService.getValidToken();
          if (freshToken) {
            token = freshToken;
            this.tokenService.setToken(freshToken);
            this.storageService.setJwtToken(freshToken);
          }
        } catch {
          // fallback to stored token
        }
      }
      return token;
    };

    return from(prepareAuth()).pipe(
      switchMap((token: string) => {
        const url = `${this.getBaseUrl()}/auth/auth`;
        let headers = new HttpHeaders().set('Accept', 'application/json, text/plain, */*');
        const finalToken = token || this.tokenService.getToken() || this.storageService.getJwtToken() || '';
        if (finalToken) {
          headers = headers.set('Authorization', `Bearer ${finalToken}`);
        }
        return this.http.get<any>(url, { headers });
      })
    );
  }

  /**
   * 1. POST /auth/get_product_users_details?page=1&limit=10
   * Fetches paginated list of product users.
   * Payload: { "roles": string[] }
   * - { "roles": [] } to get all the users
   * - { "roles": ["is_k_agent_user", "is_kaf_user"] } to get product based users
   */
  getProductUsersDetails(
    page: number = 1,
    limit: number = 20,
    roles: string[] = [],
    sortBy?: string | null,
    order?: 'asc' | 'desc',
  ): Observable<ProductUsersListResponse> {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (sortBy) {
      qs.set('sort_by', sortBy);
    }
    if (order) {
      qs.set('order', order);
    }
    const url = `${this.getBaseUrl()}/auth/get_product_users_details?${qs.toString()}`;
    return this.http.post<ProductUsersListResponse>(
      url,
      { roles },
      { headers: this.getAuthHeaders(true) },
    );
  }

  /**
   * Alias for getProductUsersDetails
   */
  getProductDetails(
    page: number = 1,
    limit: number = 10,
    roles: string[] = [],
    sortBy?: string | null,
    order?: 'asc' | 'desc',
  ): Observable<ProductUsersListResponse> {
    return this.getProductUsersDetails(page, limit, roles, sortBy, order);
  }

  /**
   * 2. POST /auth/product-users/search?query=sures
   * Searches product users by query string.
   */
  searchProductUsers(query: string): Observable<ProductUsersListResponse> {
    const encoded = encodeURIComponent(query.trim());
    const url = `${this.getBaseUrl()}/auth/product-users/search?query=${encoded}`;
    return this.http.post<ProductUsersListResponse>(
      url,
      {},
      { headers: this.getAuthHeaders(true) },
    );
  }

  /**
   * 3. POST /auth/get_product_user
   * Fetches full permissions/access details for a single product user.
   * Payload: { "bot_type": "kumaran", "username": "suresh.rajendran@kumaran.world" }
   */
  getProductUser(
    payload: GetProductUserPayload,
  ): Observable<ProductUserDetailResponse> {
    const url = `${this.getBaseUrl()}/auth/get_product_user`;
    return this.http.post<ProductUserDetailResponse>(
      url,
      payload,
      { headers: this.getAuthHeaders(true) },
    );
  }

  /**
   * 4. POST /auth/update_product_user
   * Updates a specific access column/permission for a product user.
   * Payload: { "bot_type": "kumaran", "username": "...", "column_name": "is_product_admin", "column_value": true }
   */
  updateProductUser(payload: UpdateProductUserPayload): Observable<any> {
    const url = `${this.getBaseUrl()}/auth/update_product_user`;
    return this.http.post<any>(
      url,
      payload,
      { headers: this.getAuthHeaders(true) },
    );
  }

  /**
   * 5. POST /auth/product-users/sorted?column_name=true&order=desc&page=1
   * Body: { "column_name": "is_product_admin", "column_value": true }
   * Fetches users sorted by column or filtered by product permission in ascending/descending order.
   */
  getSortedProductUsers(params: {
    sort_by?: string;
    column_name?: string;
    column_value?: boolean | string;
    order?: 'asc' | 'desc';
    page: number;
    limit?: number;
  }): Observable<ProductUsersListResponse> {
    const qs = new URLSearchParams();
    const sortBy = params.sort_by || params.column_name;
    if (sortBy) {
      qs.set('sort_by', sortBy);
    }
    if (params.order) {
      qs.set('order', params.order);
    }
    qs.set('page', String(params.page));
    qs.set('limit', String(params.limit ?? 20));

    const body: Record<string, any> = {};
    if (params.column_name) {
      body['column_name'] = params.column_name;
      body['column_value'] = params.column_value !== undefined ? params.column_value : true;
    }
    if (sortBy) {
      body['sort_by'] = sortBy;
    }

    const url = `${this.getBaseUrl()}/auth/product-users/sorted?${qs.toString()}`;
    return this.http.post<ProductUsersListResponse>(
      url,
      body,
      { headers: this.getAuthHeaders(true) },
    );
  }
}
