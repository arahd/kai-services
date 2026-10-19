import { Injectable, signal, computed } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

export interface TelemetryTypeConfig {
  events?: boolean;
  traces?: boolean;
  exceptions?: boolean;
  metrics?: boolean;
  pageViews?: boolean;
  dependencies?: boolean;
}

export interface TelemetryCategoryConfig {
  enabled?: boolean;
  types?: TelemetryTypeConfig;
  categories?: Record<string, boolean>;
}

export interface AppConfig {
  chatbotUrl: string;
  azureUrl: string;
  hrportalUrl: string;
  azureAd: {
    clientId: string;
    tenantId: string;
    redirectUri: string;
    scopes: string;
  };
  kafUrl: string;
  kplatformUrl: string;
  azureAppInsightsConnectionString?: string;
  telemetry?: TelemetryCategoryConfig;
  docSpecUrl?: string;
  sddUrl?: string;
  mainframeUrl?: string;
  productSuites?: any[];
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private readonly _config = signal<AppConfig | null>(null);
  readonly configSignal = this._config.asReadonly();
  readonly isConfigLoadedSignal = computed(() => this._config() !== null);
  public readonly configLoaded$: Observable<boolean> = toObservable(this.isConfigLoadedSignal);

  private get config(): AppConfig | null {
    return this._config();
  }

  private set config(val: AppConfig | null) {
    this._config.set(val);
  }

  /** Load config from public/config.json */
  async loadConfig(): Promise<void> {
    if (this.config) return; // already loaded

    try {
      const res = await fetch('/config.json');
      if (!res.ok) throw new Error(`Failed to load config: ${res.status}`);
      const json = await res.json();
      if (json && json.encrypted_data && json.nonce) {
        this.config = (await this.decryptData(json)) as AppConfig;
      } else {
        this.config = json as AppConfig;
      }

      // ✅ Verification log
      console.log('[ConfigService] Loaded config:', this.config);
      console.log('[ConfigService] kafUrl:', this.config.kafUrl);

      // Optional: validation
      this.verifyConfig();

    } catch (err) {
      console.error('Error loading config:', err);
    }
  }

  private verifyConfig(): void {
    if (!this.config) {
      throw new Error('Config not loaded');
    }

    const actualKafUrl = this.config.kafUrl;

    if (!actualKafUrl) {
      console.warn('[ConfigService] kafUrl is missing in config');
    } else {
      console.log('[ConfigService] kafUrl found in config:', actualKafUrl);
    }
  }

  private async decryptData(encryptedJson: { nonce: string; encrypted_data: string }): Promise<any> {
    const SECRET_KEY = "12345678901234567890123456789321";

    // Convert key to Uint8Array
    const encoder = new TextEncoder();

    const key = await crypto?.subtle?.importKey(
      "raw",
      encoder.encode(SECRET_KEY),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    // Decode base64 values
    const nonce = Uint8Array.from(
      atob(encryptedJson.nonce),
      c => c.charCodeAt(0)
    );

    const encryptedData = Uint8Array.from(
      atob(encryptedJson.encrypted_data),
      c => c.charCodeAt(0)
    );

    // Decrypt
    const decrypted = await crypto?.subtle?.decrypt(
      {
        name: "AES-GCM",
        iv: nonce
      },
      key,
      encryptedData
    );

    // Convert back to JSON
    const decoded = new TextDecoder().decode(decrypted);

    console.log('Decoded Config =>', decoded);

    return JSON.parse(decoded);
  }

  getConfig(): AppConfig {
    if (!this.config) {
      throw new Error(
        'Config not loaded yet. Call loadConfig() before accessing.',
      );
    }
    return this.config;
  }

  getChatbotUrl(): string {
    return this.config?.chatbotUrl || '';
  }

  getAzureUrl(): string {
    return this.config?.azureUrl || '';
  }

  getHrPortalUrl(): string {
    return this.config?.hrportalUrl || '';
  }

  getKafUrl(): string {
    return this.config?.kafUrl || '';
  }

  getKPlatformUrl(): string {
    return this.config?.kplatformUrl || '';
  }

  getAzureAppInsightsConnectionString(): string {
    return this.config?.azureAppInsightsConnectionString || '';
  }

  getTelemetryConfig(): TelemetryCategoryConfig | undefined {
    return this.config?.telemetry;
  }

  isTelemetryEnabled(): boolean {
    return this.config?.telemetry?.enabled ?? true;
  }

  isTelemetryTypeEnabled(type: keyof TelemetryTypeConfig): boolean {
    if (!this.isTelemetryEnabled()) return false;
    return this.config?.telemetry?.types?.[type] ?? true;
  }

  isTelemetryCategoryEnabled(category?: string): boolean {
    if (!this.isTelemetryEnabled()) return false;
    if (!category) return true;
    return this.config?.telemetry?.categories?.[category] ?? true;
  }

  getDocSpecUrl(): string {
    return this.getConfig().docSpecUrl || '';
  }

  getSdduiUrl(): string {
    return this.getConfig().sddUrl || '';
  }

  getMainframeUrl(): string {
    return this.getConfig().mainframeUrl || '';
  }

  getProductSuites<T = any>(): T[] | undefined {
    return this.config?.productSuites as T[] | undefined;
  }

  isConfigLoaded(): boolean {
    return this.config !== null;
  }
}
