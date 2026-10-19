import { Injectable, inject } from '@angular/core';
import { ApplicationInsights, SeverityLevel } from '@microsoft/applicationinsights-web';
import { AngularPlugin } from '@microsoft/applicationinsights-angularplugin-js';
import { ConfigService } from './config.service';

export enum LogSeverity {
  Verbose = SeverityLevel.Verbose,
  Information = SeverityLevel.Information,
  Warning = SeverityLevel.Warning,
  Error = SeverityLevel.Error,
  Critical = SeverityLevel.Critical
}

/**
 * Enterprise Telemetry & Azure Application Insights Service
 * Standardized logging interface implementing SOLID principles.
 */
@Injectable({
  providedIn: 'root'
})
export class TelemetryLoggerService {
  private readonly configService = inject(ConfigService);
  private readonly angularPlugin = new AngularPlugin();
  private appInsights!: ApplicationInsights;
  private isInitialized = false;
  private hasWarnedMissingConfig = false;

  constructor() {
    // Attempt initial sync setup if config is already available
    this.initAppInsights();

    // Subscribe to ConfigService async loading event safely
    this.configService?.configLoaded$?.subscribe((isLoaded) => {
      if (isLoaded && !this.isInitialized) {
        this.initAppInsights();
      }
    });
  }

  /**
   * Returns Angular Plugin reference for Router tracing
   */
  public getAngularPlugin(): AngularPlugin {
    return this.angularPlugin;
  }

  /**
   * Initializes Application Insights SDK using connection string from ConfigService
   */
  public initAppInsights(): boolean {
    if (this.isInitialized) return true;

    // Skip live Azure App Insights network requests during Karma unit tests
    if (typeof window !== 'undefined' && (window as any).__karma__) {
      return false;
    }

    // Check if runtime configuration is loaded yet
    if (this.configService?.isConfigLoaded && !this.configService.isConfigLoaded()) {
      return false;
    }

    const connectionString = this.configService?.getAzureAppInsightsConnectionString?.();

    if (!connectionString) {
      if (!this.hasWarnedMissingConfig) {
        console.warn('[TelemetryLoggerService] Azure Connection String is missing in config. Telemetry disabled.');
        this.hasWarnedMissingConfig = true;
      }
      return false;
    }

    const isDependenciesEnabled = this.configService.isTelemetryTypeEnabled('dependencies');
    const isPageViewsEnabled = this.configService.isTelemetryTypeEnabled('pageViews');

    try {
      this.appInsights = new ApplicationInsights({
        config: {
          connectionString: connectionString,
          extensions: [this.angularPlugin],
          enableAutoRouteTracking: isPageViewsEnabled,
          enableCorsCorrelation: true,
          enableUnhandledPromiseRejectionTracking: true,
          disableFetchTracking: !isDependenciesEnabled,
          disableAjaxTracking: !isDependenciesEnabled,
          disableFlushOnBeforeUnload: true,
          disableFlushOnUnload: true
        }
      });

      this.appInsights.loadAppInsights();

      // Register Telemetry Initializer for fine-grained category & type filtering at SDK level
      this.appInsights.addTelemetryInitializer((envelope: any) => {
        if (!this.configService.isTelemetryEnabled()) {
          return false;
        }

        const baseType = envelope.data?.['baseType'];
        const baseData = envelope.data?.['baseData'];
        const properties = baseData?.['properties'] || {};
        const category = properties['category'] || properties['Category'];

        // Filter by Custom Domain Category
        if (category && !this.configService.isTelemetryCategoryEnabled(category)) {
          return false;
        }

        // Filter by Telemetry Type
        if (baseType === 'EventData' && !this.configService.isTelemetryTypeEnabled('events')) {
          return false;
        }
        if (baseType === 'MessageData' && !this.configService.isTelemetryTypeEnabled('traces')) {
          return false;
        }
        if (baseType === 'ExceptionData' && !this.configService.isTelemetryTypeEnabled('exceptions')) {
          return false;
        }
        if (baseType === 'MetricData' && !this.configService.isTelemetryTypeEnabled('metrics')) {
          return false;
        }
        if (baseType === 'PageViewData' && !this.configService.isTelemetryTypeEnabled('pageViews')) {
          return false;
        }
        if (baseType === 'RemoteDependencyData' && !this.configService.isTelemetryTypeEnabled('dependencies')) {
          return false;
        }

        return true;
      });

      this.isInitialized = true;
      console.log('[TelemetryLoggerService] Azure Application Insights initialized successfully.');
      return true;
    } catch (error) {
      console.error('[TelemetryLoggerService] Failed to initialize Azure Application Insights:', error);
      return false;
    }
  }

  /**
   * Helper check to evaluate if a log of specified type/category should proceed
   */
  public shouldLog(type: 'events' | 'traces' | 'exceptions' | 'metrics' | 'pageViews', category?: string): boolean {
    if (!this.configService.isTelemetryEnabled()) return false;
    if (!this.configService.isTelemetryTypeEnabled(type)) return false;
    if (category && !this.configService.isTelemetryCategoryEnabled(category)) return false;
    return true;
  }

  /**
   * Internal helper to lazy-initialize App Insights as soon as ConfigService finishes loading
   */
  private ensureInitialized(): boolean {
    if (this.isInitialized) return true;
    return this.initAppInsights();
  }

  /**
   * Log custom events (e.g. User actions, feature triggers)
   */
  public logEvent(name: string, properties?: Record<string, any>, category?: string): void {
    const eventCategory = category || properties?.['category'];
    if (!this.shouldLog('events', eventCategory)) return;

    console.log(`[Telemetry Event] ${name}`, properties || '');
    if (!this.ensureInitialized()) return;
    const finalProps = category ? { category, ...properties } : properties;
    this.appInsights.trackEvent({ name }, finalProps);
  }

  /**
   * Log custom trace message with specified severity level
   */
  public logTrace(message: string, severityLevel: LogSeverity = LogSeverity.Information, properties?: Record<string, any>, category?: string): void {
    const traceCategory = category || properties?.['category'];
    if (!this.shouldLog('traces', traceCategory)) return;

    const label = LogSeverity[severityLevel] || severityLevel;
    console.log(`[Telemetry Trace] [${label}] ${message}`, properties || '');
    if (!this.ensureInitialized()) return;
    const finalProps = category ? { category, ...properties } : properties;
    this.appInsights.trackTrace({ message, severityLevel }, finalProps);
  }

  /**
   * Log custom exceptions / errors manually with properties
   */
  public logException(exception: Error, severityLevel: LogSeverity = LogSeverity.Error, properties?: Record<string, any>, category?: string): void {
    const excCategory = category || properties?.['category'];
    if (!this.shouldLog('exceptions', excCategory)) return;

    console.error(`[Telemetry Exception] ${exception?.message || exception}`, exception, properties || '');
    if (!this.ensureInitialized()) return;
    const finalProps = category ? { category, ...properties } : properties;
    this.appInsights.trackException({ exception, severityLevel }, finalProps);
  }

  /**
   * Log numeric metrics (e.g. execution time, byte counts)
   */
  public logMetric(name: string, average: number, properties?: Record<string, any>, category?: string): void {
    const metricCategory = category || properties?.['category'];
    if (!this.shouldLog('metrics', metricCategory)) return;

    console.log(`[Telemetry Metric] ${name}: ${average}`, properties || '');
    if (!this.ensureInitialized()) return;
    const finalProps = category ? { category, ...properties } : properties;
    this.appInsights.trackMetric({ name, average }, finalProps);
  }

  /**
   * Log page views manually
   */
  public logPageView(name?: string, url?: string, category?: string): void {
    if (!this.shouldLog('pageViews', category)) return;

    console.log(`[Telemetry PageView] ${name || ''} - ${url || ''}`);
    if (!this.ensureInitialized()) return;
    this.appInsights.trackPageView({ name, uri: url });
  }

  /**
   * Attach logged-in user context to all telemetry events
   */
  public setUserContext(userId: string, accountId?: string): void {
    console.log(`[Telemetry UserContext] Set user: ${userId}`);
    if (!this.ensureInitialized()) return;
    this.appInsights.setAuthenticatedUserContext(userId, accountId, true);
  }

  /**
   * Clear user context on logout
   */
  public clearUserContext(): void {
    console.log('[Telemetry UserContext] Cleared user context');
    if (!this.ensureInitialized()) return;
    this.appInsights.clearAuthenticatedUserContext();
  }
}
