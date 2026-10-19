import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ConfigService } from '@core/services/config.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { ChatErrorHandlerService } from '@core/services/error-handler.service';
import { SessionStorageService, StorageKeys } from '@core/services/session-storage.service';
import { inject } from '@angular/core';

/**
 * Abstract BaseApiService implementing the Template Method pattern.
 * Eliminates massive duplication across ChatService methods by encapsulating:
 * - Config loading
 * - Token retrieval and attaching to headers
 * - Auto-refresh and retry on 401 Unauthorized
 * - Standardized error handling
 */
export abstract class BaseApiService {
  protected abstract readonly http: HttpClient;
  protected abstract readonly configService: ConfigService;
  protected abstract readonly azureAdService: AzureAdService;
  private readonly errorHandler = inject(ChatErrorHandlerService);
  protected readonly storageService = inject(SessionStorageService);

  /** Subclasses must define which base URL they hit (e.g. getAzureUrl() or getChatbotUrl()) */
  protected abstract getBaseUrl(): string;

  /** Performs a POST request with auth token handling and config loading. */
  protected post<T>(endpoint: string, body: unknown): Observable<T> {
    return from(this.configService.loadConfig()).pipe(
      switchMap(() => {
        const url = `${this.getBaseUrl()}${endpoint}`;
        return from(this.postWithAuth<T>(url, body));
      })
    );
  }

  /** Performs a GET request with auth token handling and config loading. */
  protected get<T>(endpoint: string, options?: any): Observable<T> {
    return from(this.configService.loadConfig()).pipe(
      switchMap(() => {
        const url = `${this.getBaseUrl()}${endpoint}`;
        return from(this.getWithAuth<T>(url, options));
      })
    );
  }

  /** Performs a PUT request with auth token handling and config loading. */
  protected put<T>(endpoint: string, body: unknown): Observable<T> {
    return from(this.configService.loadConfig()).pipe(
      switchMap(() => {
        const url = `${this.getBaseUrl()}${endpoint}`;
        return from(this.putWithAuth<T>(url, body));
      })
    );
  }

  /** Performs a POST request WITHOUT auth token. Used for public/shared endpoints. */
  protected postPublic<T>(endpoint: string, body: unknown): Observable<T> {
    return from(this.configService.loadConfig()).pipe(
      switchMap(() => {
        const url = `${this.getBaseUrl()}${endpoint}`;
        return from(this.postWithoutAuth<T>(url, body));
      })
    );
  }

  /** Performs a DELETE request with auth token handling and config loading. */
  protected delete<T>(endpoint: string, body?: unknown): Observable<T> {
    return from(this.configService.loadConfig()).pipe(
      switchMap(() => {
        const url = `${this.getBaseUrl()}${endpoint}`;
        return from(this.deleteWithAuth<T>(url, body));
      })
    );
  }

  /** Performs a POST request and returns the raw Response for blob handling. */
  protected postForRawResponse(endpoint: string, body: unknown): Observable<Response> {
    return from(this.configService.loadConfig()).pipe(
      switchMap(() => {
        const url = `${this.getBaseUrl()}${endpoint}`;
        const token = this.storageService.getJwtToken() || '';
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
        
        return new Observable<Response>((observer) => {
          fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
            .then(async (response) => {
              if (response.status === 401) {
                await this.refreshTokenAndRetry(async (newToken) => {
                  const retryHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${newToken}` };
                  const retry = await fetch(url, { method: 'POST', headers: retryHeaders, body: JSON.stringify(body) });
                  observer.next(retry);
                  observer.complete();
                  return null as any;
                });
              } else {
                observer.next(response);
                observer.complete();
              }
            })
            .catch(err => observer.error(err));
        });
      })
    );
  }

  // --- Internal Fetch Wrappers handling 401 retries ---

  private async postWithAuth<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const token = this.storageService.getJwtToken() || '';
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });

    if (response.status === 401) {
      return this.refreshTokenAndRetry(() => this.postWithAuth<T>(url, body, signal));
    }

    if (!response.ok) {
      throw await this.handleFetchError(response);
    }
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : ({} as T);
    } catch {
      return text as unknown as T;
    }
  }

  private async postWithoutAuth<T>(url: string, body: unknown): Promise<T> {
    const headers = { 'Content-Type': 'application/json' };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!response.ok) {
      throw await this.handleFetchError(response);
    }
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : ({} as T);
    } catch {
      return text as unknown as T;
    }
  }

  private async getWithAuth<T>(url: string, options?: any): Promise<T> {
    const token = this.storageService.getJwtToken() || '';
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Apply URL params if provided
    let finalUrl = url;
    if (options?.params) {
      const qs = options.params.toString();
      finalUrl = `${url}?${qs}`;
    }

    const response = await fetch(finalUrl, { method: 'GET', headers });

    if (response.status === 401) {
      return this.refreshTokenAndRetry(() => this.getWithAuth<T>(url, options));
    }

    if (!response.ok) {
      throw await this.handleFetchError(response);
    }
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : ({} as T);
    } catch {
      return text as unknown as T;
    }
  }

  private async putWithAuth<T>(url: string, body: unknown): Promise<T> {
    const token = this.storageService.getJwtToken() || '';
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

    const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });

    if (response.status === 401) {
      return this.refreshTokenAndRetry(() => this.putWithAuth<T>(url, body));
    }

    if (!response.ok) {
      throw await this.handleFetchError(response);
    }
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : ({} as T);
    } catch {
      return text as unknown as T;
    }
  }

  private async deleteWithAuth<T>(url: string, body?: unknown): Promise<T> {
    const token = this.storageService.getJwtToken() || '';
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

    const options: RequestInit = { method: 'DELETE', headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (response.status === 401) {
      return this.refreshTokenAndRetry(() => this.deleteWithAuth<T>(url, body));
    }

    if (!response.ok) {
      throw await this.handleFetchError(response);
    }
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : ({} as T);
    } catch {
      return text as unknown as T;
    }
  }

  /** Centralized token refresh mechanism. */
  protected async refreshTokenAndRetry<T>(callback: (token: string) => Promise<T>): Promise<T> {
    console.warn('🔄 Token expired, refreshing via BaseApiService...');
    try {
      const newToken = await this.azureAdService.getValidToken();
      this.storageService.setJwtToken(newToken);
      return callback(newToken);
    } catch (err) {
      console.error('Failed to refresh token', err);
      throw err;
    }
  }

  /** Standardized error mapping for fetch API responses. */
  private async handleFetchError(response: Response): Promise<HttpErrorResponse> {
    let errorObj = {};
    try {
      errorObj = await response.json();
    } catch (e) {
      try {
        const text = await response.text();
        errorObj = { message: text };
      } catch (e2) {
        // give up
      }
    }
    const httpErr = new HttpErrorResponse({
      error: errorObj,
      status: response.status,
      statusText: response.statusText,
      url: response.url
    });

    // Forward error to ChatErrorHandlerService to log to Azure Application Insights & handle toast popups
    this.errorHandler.handleApiError(httpErr);

    return httpErr;
  }
}
