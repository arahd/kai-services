import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { PublicClientApplication, AccountInfo, RedirectRequest } from '@azure/msal-browser';
import { SilentRequest, AuthenticationResult } from '@azure/msal-browser';
import { ConfigService } from '@core/services/config.service';
import { TokenService } from '@core/services/token.service';
export interface UserInfo {
  name: string;
  email: string;
  id: string;
  roles?: string[];
}

@Injectable({ providedIn: 'root' })
export class AzureAdService {
  private readonly configService = inject(ConfigService);
  private readonly tokenService = inject(TokenService);

  private msalInstance!: PublicClientApplication;
  private account: AccountInfo | null = null;
  private initialized = false;

  private readonly _user = signal<UserInfo | null>(null);
  readonly user = this._user.asReadonly();
  readonly user$ = toObservable(this._user);

  constructor() {
    this.initMsal();
  }

  /** Initialize MSAL and handle redirect */
  async initMsal(): Promise<void> {
    // ⬇️ Wait until config is loaded before using it
    await this.configService.loadConfig();
    const cfg = this.configService.getConfig().azureAd;
    this.msalInstance = new PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: `https://login.microsoftonline.com/organizations`,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: false,
      },
    });

    // Wait for MSAL to fully initialize (new requirement in v2)
    await this.msalInstance.initialize();

    // Handle redirect login response
    const result = await this.msalInstance.handleRedirectPromise();

    if (result?.account) {
      this.account = result.account;
      this.setUserInfo(result.account);
    } else {
      // If already logged in, get first account
      const accounts = this.msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        this.account = accounts[0];
        this.setUserInfo(this.account);
      } else {
        this.loadUserFromSession(); // Try to load from session if no MSAL account
      }
    }

    this.initialized = true;
  }

  /** Load user info from session */
  private loadUserFromSession(): void {
    const userInfo = this.tokenService.getUserInfo();
    if (userInfo) {
      try {
        this._user.set(userInfo);

        // Reconstruct a pseudo AccountInfo object
        this.account = {
          homeAccountId: userInfo.id,
          localAccountId: userInfo.id,
          environment: '',
          tenantId: '',
          username: userInfo.email,
          name: userInfo.name,
          idTokenClaims: { roles: userInfo.roles || [] }
        };
      } catch (error) {
        console.error('Error parsing stored user info:', error);
        this.clearUserInfo();
      }
    }
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initMsal();
    }
  }

  /** Convert MSAL AccountInfo to our UserInfo format */
  private accountToUserInfo(account: AccountInfo): UserInfo {
    return {
      name: account.name || '',
      email: account.username || '',
      id: account.homeAccountId,
      // You can extract roles from idTokenClaims if needed
      roles: account.idTokenClaims?.roles || []
    };
  }

  /** Store user info in session */
  private setUserInfo(account: AccountInfo): void {
    const userInfo = this.accountToUserInfo(account);
    this._user.set(userInfo);

    // Store in TokenService
    this.tokenService.setUserInfo(userInfo);
  }

  /** Clear user info from session */
  private clearUserInfo(): void {
    this._user.set(null);
    this.tokenService.setUserInfo(null);
  }

  /** Check if the current URL has OAuth/OIDC redirect response parameters */
  isRedirectCallback(): boolean {
    if (typeof window === 'undefined') return false;
    const url = window.location.href;
    return url.includes('code=') || url.includes('error=') || url.includes('state=');
  }

  /** Login with redirect */
  async login(): Promise<void> {
    if (!this.initialized) {
      await this.initMsal();
    }

    const request: RedirectRequest = { scopes: [`api://${this.configService.getConfig().azureAd.clientId}/${this.configService.getConfig().azureAd.scopes}`] };
    await this.msalInstance.loginRedirect(request);
  }

  /** Logout */
  async logout(): Promise<void> {
    if (!this.initialized) {
      await this.initMsal();
    }
    this.clearUserInfo();
    await this.msalInstance.logoutRedirect();
  }

  /** Check login status */
  isLoggedIn(): boolean {
    if (this.account) return true;

    // Check TokenService fallback
    return !!this.tokenService.getUserInfo();
  }

  /** Get user info */
  getUser(): AccountInfo | null {
    return this.account;
  }

  /** Get formatted user info */
  getUserInfo(): UserInfo | null {
    return this._user();
  }

  /** Get user info as observable */
  getUserInfoObservable() {
    return this.user$;
  }

  async getToken(): Promise<AuthenticationResult> {
    if (!this.account) throw new Error('No logged-in account');

    const request: SilentRequest = {
      account: this.account,
      scopes: [`api://${this.configService.getConfig().azureAd.clientId}/${this.configService.getConfig().azureAd.scopes}`]
    };

    try {
      const result = await this.msalInstance.acquireTokenSilent(request);
      return result; // contains accessToken, idToken, expiresOn, etc.
    } catch (err) {
      console.warn('Silent token acquisition failed, falling back to popup', err);
      // fallback to interactive login if silent fails
      const result = await this.msalInstance.acquireTokenPopup(request);
      return result;
    }
  }
  /** Get a valid access token, refresh if expired */
  async getValidToken(forceRefresh: boolean = false): Promise<string> {
    if (!this.account) throw new Error('No logged-in account');

    const request: SilentRequest = {
      account: this.account,
      scopes: [`api://${this.configService.getConfig().azureAd.clientId}/${this.configService.getConfig().azureAd.scopes}`],
      forceRefresh: forceRefresh
    };

    try {
      // Try silent acquisition first
      const result = await this.msalInstance.acquireTokenSilent(request);
      return result.accessToken;
    } catch (err) {
      // Fallback to interactive popup
      const result = await this.msalInstance.acquireTokenPopup(request);
      return result.accessToken;
    }
  }

  /** Optional: schedule automatic token refresh before expiry */
  scheduleTokenRefresh(callback: (token: string) => void) {
    this.getToken().then((result: any) => {
      const expiresInMs = result.expiresOn.getTime() - Date.now();
      const refreshTime = Math.max(expiresInMs - 60000, 0); // 1 min before expiry
      setTimeout(async () => {
        const newToken = await this.getValidToken();
        callback(newToken);
        this.scheduleTokenRefresh(callback); // recursively schedule next refresh
      }, refreshTime);
    });
  }

}