import { TestBed } from '@angular/core/testing';
import { TelemetryLoggerService, LogSeverity } from './telemetry-logger.service';
import { ConfigService } from './config.service';

describe('TelemetryLoggerService', () => {
  let service: TelemetryLoggerService;
  let configServiceMock: jasmine.SpyObj<ConfigService>;

  beforeEach(() => {
    configServiceMock = jasmine.createSpyObj('ConfigService', [
      'isConfigLoaded',
      'getAzureAppInsightsConnectionString',
      'isTelemetryEnabled',
      'isTelemetryTypeEnabled',
      'isTelemetryCategoryEnabled'
    ], {
      configLoaded$: { subscribe: (fn: any) => fn(true) } as any
    });

    configServiceMock.isTelemetryEnabled.and.returnValue(true);
    configServiceMock.isTelemetryTypeEnabled.and.returnValue(true);
    configServiceMock.isTelemetryCategoryEnabled.and.returnValue(true);

    TestBed.configureTestingModule({
      providers: [
        TelemetryLoggerService,
        { provide: ConfigService, useValue: configServiceMock }
      ]
    });

    service = TestBed.inject(TelemetryLoggerService);
  });

  it('should return Angular plugin reference', () => {
    expect(service.getAngularPlugin()).toBeDefined();
  });

  it('should log events without throwing errors', () => {
    expect(() => service.logEvent('user_login', { user: 'test' })).not.toThrow();
  });

  it('should log trace message with severity level', () => {
    expect(() => service.logTrace('trace test', LogSeverity.Information)).not.toThrow();
  });

  it('should log exception with properties', () => {
    const error = new Error('Test exception');
    expect(() => service.logException(error, LogSeverity.Error, { component: 'App' })).not.toThrow();
  });

  it('should log metrics and page views', () => {
    expect(() => service.logMetric('page_load_ms', 120)).not.toThrow();
    expect(() => service.logPageView('Home', '/home')).not.toThrow();
  });

  it('should handle user context setting and clearing', () => {
    expect(() => service.setUserContext('user-123', 'acc-456')).not.toThrow();
    expect(() => service.clearUserContext()).not.toThrow();
  });

  it('should suppress logging when category or type is disabled', () => {
    configServiceMock.isTelemetryTypeEnabled.and.callFake((type: string) => type !== 'traces');
    configServiceMock.isTelemetryCategoryEnabled.and.callFake((cat?: string) => cat !== 'Admin');

    expect(service.shouldLog('traces', 'Chat')).toBeFalse();
    expect(service.shouldLog('events', 'Admin')).toBeFalse();
    expect(service.shouldLog('events', 'Chat')).toBeTrue();
  });
});
