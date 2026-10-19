import { TestBed } from '@angular/core/testing';
import { ConfigService, AppConfig } from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;

  const mockConfig: AppConfig = {
    chatbotUrl: 'https://chatbot.test',
    azureUrl: 'https://azure.test',
    hrportalUrl: 'https://hrportal.test',
    azureAd: {
      clientId: 'client-123',
      tenantId: 'tenant-123',
      redirectUri: 'http://localhost',
      scopes: 'user.read'
    },
    kafUrl: 'https://kaf-dev.kumaran.ai/login',
    kplatformUrl: 'https://kplatform.test',
    azureAppInsightsConnectionString: 'InstrumentationKey=123',
    docSpecUrl: 'https://doc.test',
    sddUrl: 'https://sdd.test',
    mainframeUrl: 'https://mainframe.test'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ConfigService]
    });
    service = TestBed.inject(ConfigService);
  });

  it('should throw error when accessing config before loading', () => {
    expect(service.isConfigLoaded()).toBeFalse();
    expect(() => service.getConfig()).toThrowError(/Config not loaded yet/);
    expect(service.getAzureAppInsightsConnectionString()).toBe('');
  });

  it('should load config successfully from /config.json', async () => {
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify(mockConfig), { status: 200 }))
    );

    await service.loadConfig();

    expect(service.isConfigLoaded()).toBeTrue();
    expect(service.getChatbotUrl()).toBe('https://chatbot.test');
    expect(service.getAzureUrl()).toBe('https://azure.test');
    expect(service.getHrPortalUrl()).toBe('https://hrportal.test');
    expect(service.getKafUrl()).toBe('https://kaf-dev.kumaran.ai/login');
    expect(service.getKPlatformUrl()).toBe('https://kplatform.test');
    expect(service.getAzureAppInsightsConnectionString()).toBe('InstrumentationKey=123');
    expect(service.getDocSpecUrl()).toBe('https://doc.test');
    expect(service.getSdduiUrl()).toBe('https://sdd.test');
    expect(service.getMainframeUrl()).toBe('https://mainframe.test');
  });

  it('should handle fetch failure gracefully', async () => {
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response('', { status: 500 }))
    );

    await service.loadConfig();
    expect(service.isConfigLoaded()).toBeFalse();
  });

  it('should evaluate telemetry category and type flags correctly with defaults', async () => {
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify(mockConfig), { status: 200 }))
    );
    await service.loadConfig();

    expect(service.isTelemetryEnabled()).toBeTrue();
    expect(service.isTelemetryTypeEnabled('events')).toBeTrue();
    expect(service.isTelemetryCategoryEnabled('Chat')).toBeTrue();
  });

  it('should evaluate telemetry category and type flags when explicitly disabled in config', async () => {
    const customConfig: AppConfig = {
      ...mockConfig,
      telemetry: {
        enabled: true,
        types: {
          traces: false,
          events: true
        },
        categories: {
          Admin: false,
          Chat: true
        }
      }
    };

    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify(customConfig), { status: 200 }))
    );
    await service.loadConfig();

    expect(service.isTelemetryEnabled()).toBeTrue();
    expect(service.isTelemetryTypeEnabled('traces')).toBeFalse();
    expect(service.isTelemetryTypeEnabled('events')).toBeTrue();
    expect(service.isTelemetryCategoryEnabled('Admin')).toBeFalse();
    expect(service.isTelemetryCategoryEnabled('Chat')).toBeTrue();
  });
});
