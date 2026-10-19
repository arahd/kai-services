import { TestBed } from '@angular/core/testing';
import { HttpClient, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorInterceptor } from './error.interceptor';
import { ChatErrorHandlerService } from '@core/services/error-handler.service';

describe('HttpErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let errorHandlerMock: jasmine.SpyObj<ChatErrorHandlerService>;

  beforeEach(() => {
    errorHandlerMock = jasmine.createSpyObj('ChatErrorHandlerService', ['handleApiError']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: HTTP_INTERCEPTORS,
          useClass: HttpErrorInterceptor,
          multi: true
        },
        { provide: ChatErrorHandlerService, useValue: errorHandlerMock }
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should intercept HTTP error and pass to ChatErrorHandlerService', () => {
    http.get('/api/error-test').subscribe({
      error: () => {}
    });

    const req = httpMock.expectOne('/api/error-test');
    req.flush('Error occurred', { status: 500, statusText: 'Server Error' });

    expect(errorHandlerMock.handleApiError).toHaveBeenCalled();
  });
});
