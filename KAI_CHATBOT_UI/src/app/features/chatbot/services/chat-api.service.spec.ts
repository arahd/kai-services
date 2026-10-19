import { TestBed } from '@angular/core/testing';
import { ChatApiService } from './chat-api.service';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfigService } from '@core/services/config.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { ToastService } from '@core/services/toast.service';
import { of } from 'rxjs';

describe('ChatApiService', () => {
  let service: ChatApiService;
  let httpMock: HttpTestingController;

  const mockConfigService = {
    loadConfig: () => Promise.resolve(),
    getChatbotUrl: () => 'https://api.test',
    getAzureUrl: () => 'https://azure.test',
    isConfigLoaded: () => true,
    configLoaded$: of(true)
  };

  const mockAzureAdService = {
    getValidToken: () => Promise.resolve('test-token')
  };

  const mockToastService = {
    show: () => {}
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChatApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AzureAdService, useValue: mockAzureAdService },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(ChatApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    if (httpMock) {
      httpMock.verify();
    }
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
