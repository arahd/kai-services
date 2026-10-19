import { TestBed } from '@angular/core/testing';
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BaseApiService } from './base-api.service';
import { ConfigService } from './config.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { ChatErrorHandlerService } from './error-handler.service';

@Injectable({ providedIn: 'root' })
class TestApiService extends BaseApiService {
  protected override readonly http = inject(HttpClient);
  protected override readonly configService = inject(ConfigService);
  protected override readonly azureAdService = inject(AzureAdService);

  protected override getBaseUrl(): string {
    return 'https://api.test.com';
  }

  public callPost<T>(endpoint: string, body: unknown) {
    return this.post<T>(endpoint, body);
  }
  public callGet<T>(endpoint: string, options?: any) {
    return this.get<T>(endpoint, options);
  }
  public callPut<T>(endpoint: string, body: unknown) {
    return this.put<T>(endpoint, body);
  }
  public callDelete<T>(endpoint: string, body?: unknown) {
    return this.delete<T>(endpoint, body);
  }
  public callPostPublic<T>(endpoint: string, body: unknown) {
    return this.postPublic<T>(endpoint, body);
  }
  public callPostRaw(endpoint: string, body: unknown) {
    return this.postForRawResponse(endpoint, body);
  }
}

describe('BaseApiService', () => {
  let service: TestApiService;
  let mockConfigService: any;
  let mockAzureAdService: any;
  let mockErrorHandler: any;

  beforeEach(() => {
    mockConfigService = {
      loadConfig: jasmine.createSpy('loadConfig').and.returnValue(Promise.resolve({})),
    };
    mockAzureAdService = {
      getValidToken: jasmine.createSpy('getValidToken').and.returnValue(Promise.resolve('new-token')),
    };
    mockErrorHandler = {
      handleApiError: jasmine.createSpy('handleApiError'),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TestApiService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AzureAdService, useValue: mockAzureAdService },
        { provide: ChatErrorHandlerService, useValue: mockErrorHandler },
      ],
    });

    service = TestBed.inject(TestApiService);
    sessionStorage.setItem('jwt_token', 'test-token');
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should execute GET with auth headers and load config', (done) => {
    const fakeResponse = { success: true };
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }))
    );

    service.callGet('/test-endpoint').subscribe({
      next: (res) => {
        expect(res).toEqual(fakeResponse);
        expect(mockConfigService.loadConfig).toHaveBeenCalled();
        expect(window.fetch).toHaveBeenCalledWith(
          'https://api.test.com/test-endpoint',
          jasmine.objectContaining({ method: 'GET' })
        );
        done();
      },
    });
  });

  it('should append params to GET url when options provided', (done) => {
    const fakeResponse: any[] = [];
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }))
    );

    service.callGet('/items', { params: new URLSearchParams({ page: '1' }) }).subscribe({
      next: (res) => {
        expect(res).toEqual(fakeResponse);
        expect(window.fetch).toHaveBeenCalledWith(
          'https://api.test.com/items?page=1',
          jasmine.objectContaining({ method: 'GET' })
        );
        done();
      },
    });
  });

  it('should execute POST with body', (done) => {
    const fakeResponse = { id: 123 };
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }))
    );

    service.callPost('/create', { name: 'Item' }).subscribe({
      next: (res) => {
        expect(res).toEqual(fakeResponse);
        expect(window.fetch).toHaveBeenCalledWith(
          'https://api.test.com/create',
          jasmine.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Item' }) })
        );
        done();
      },
    });
  });

  it('should execute PUT with body', (done) => {
    const fakeResponse = { updated: true };
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify(fakeResponse), { status: 200 }))
    );

    service.callPut('/update/1', { name: 'New Item' }).subscribe({
      next: (res) => {
        expect(res).toEqual(fakeResponse);
        expect(window.fetch).toHaveBeenCalledWith(
          'https://api.test.com/update/1',
          jasmine.objectContaining({ method: 'PUT' })
        );
        done();
      },
    });
  });

  it('should execute DELETE with body', (done) => {
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response('', { status: 200 }))
    );

    service.callDelete('/delete/1', { id: 1 }).subscribe({
      next: (res) => {
        expect(res).toEqual({} as any);
        expect(window.fetch).toHaveBeenCalledWith(
          'https://api.test.com/delete/1',
          jasmine.objectContaining({ method: 'DELETE' })
        );
        done();
      },
    });
  });

  it('should execute POST public without auth header', (done) => {
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    service.callPostPublic('/public-data', {}).subscribe({
      next: (res) => {
        expect(res).toEqual({ ok: true });
        const fetchArgs = (window.fetch as jasmine.Spy).calls.mostRecent().args[1];
        expect(fetchArgs.headers['Authorization']).toBeUndefined();
        done();
      },
    });
  });

  it('should refresh token and retry request on 401 status', (done) => {
    let calls = 0;
    spyOn(window, 'fetch').and.callFake(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ retried: true }), { status: 200 }));
    });

    service.callGet('/protected').subscribe({
      next: (res) => {
        expect(res).toEqual({ retried: true });
        expect(mockAzureAdService.getValidToken).toHaveBeenCalled();
        expect(sessionStorage.getItem('jwt_token')).toBe('new-token');
        done();
      },
    });
  });

  it('should handle fetch errors and forward to ChatErrorHandlerService', (done) => {
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify({ message: 'Server Error' }), { status: 500 }))
    );

    service.callGet('/error').subscribe({
      error: (err) => {
        expect(err.status).toBe(500);
        expect(mockErrorHandler.handleApiError).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should return raw Response in postForRawResponse', (done) => {
    const rawResponse = new Response('raw content', { status: 200 });
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(rawResponse));

    service.callPostRaw('/raw', { data: 'test' }).subscribe({
      next: (res) => {
        expect(res).toBe(rawResponse);
        done();
      },
    });
  });
});
