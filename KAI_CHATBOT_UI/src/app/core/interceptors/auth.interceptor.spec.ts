import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClient, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthInterceptor } from './auth.interceptor';
import { TokenService } from '@core/services/token.service';
import { AzureAdService } from '@core/auth/azure-ad.service';

describe('AuthInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenServiceMock: jasmine.SpyObj<TokenService>;
  let azureAdMock: jasmine.SpyObj<AzureAdService>;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(() => {
    tokenServiceMock = jasmine.createSpyObj('TokenService', ['getToken', 'setToken', 'clearToken']);
    azureAdMock = jasmine.createSpyObj('AzureAdService', ['getValidToken', 'logout']);
    azureAdMock.logout.and.returnValue(Promise.resolve());
    routerMock = jasmine.createSpyObj('Router', ['navigate'], { url: '/dashboard' });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: HTTP_INTERCEPTORS,
          useClass: AuthInterceptor,
          multi: true
        },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: AzureAdService, useValue: azureAdMock },
        { provide: Router, useValue: routerMock }
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should add Authorization header when token exists', () => {
    tokenServiceMock.getToken.and.returnValue('mock-jwt-token');

    http.get('/api/test').subscribe();

    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.has('Authorization')).toBeTrue();
    expect(req.request.headers.get('Authorization')).toBe('Bearer mock-jwt-token');
  });

  it('should handle 401 error and attempt token refresh', fakeAsync(() => {
    tokenServiceMock.getToken.and.returnValue('old-token');
    azureAdMock.getValidToken.and.returnValue(Promise.resolve('new-refreshed-token'));

    http.get('/api/protected').subscribe();

    const req1 = httpMock.expectOne('/api/protected');
    req1.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    tick();

    const req2 = httpMock.expectOne('/api/protected');
    expect(req2.request.headers.get('Authorization')).toBe('Bearer new-refreshed-token');
    req2.flush({ success: true });
  }));

  it('should clear token and redirect to login when token refresh fails', fakeAsync(() => {
    tokenServiceMock.getToken.and.returnValue('old-token');
    azureAdMock.getValidToken.and.returnValue(Promise.reject('Refresh failed'));

    http.get('/api/protected').subscribe({
      error: (err) => expect(err).toBeDefined()
    });

    const req1 = httpMock.expectOne('/api/protected');
    req1.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    tick();

    expect(tokenServiceMock.clearToken).toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
  }));
});
