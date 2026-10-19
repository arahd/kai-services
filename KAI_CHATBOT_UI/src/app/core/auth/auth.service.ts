import { Injectable, inject } from '@angular/core';
import { AzureAdService } from '@core/auth/azure-ad.service';

/**
 * AuthService is a wrapper for authentication logic.
 * It can handle login, logout, and checking user authentication state.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly azureAd = inject(AzureAdService);

  /**
   * Logs in the user using Azure AD
   */
  login(): void {
    this.azureAd.login();
  }

  /**
   * Logs out the user from Azure AD
   */
  logout(): void {
    this.azureAd.logout();
  }

  /**
   * Returns true if a user is currently logged in
   */
  isLoggedIn(): boolean {
    return this.azureAd.isLoggedIn();
  }

  /**
   * Returns user info from Azure AD
   */
  getUser() {
    return this.azureAd.getUser();
  }
}
