import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { TokenService } from '@core/services/token.service';

/**
 * AuthGuard prevents unauthorized users from accessing protected routes.
 * It implements the CanActivate interface to control route activation.
 */
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private readonly azureAd = inject(AzureAdService);
  private readonly router = inject(Router);
  private readonly tokenService = inject(TokenService);

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean> {
    const token = this.tokenService.getToken();
    if (!token) {
      this.router.navigate(['/login']);
      return false;
    }

    const userRoles = this.tokenService.getRoles();

    if (userRoles.length === 0) {
      this.router.navigate(['/request-access']);
      return false;
    }

    const isAdmin = this.tokenService.isAdmin();
    const isAdminChild = route.parent?.routeConfig?.path === 'admin';
    const requiredRoles: string[] = route.data?.['roles'] ?? [];

    // 1. Block /admin routes for non-admin
    if (isAdminChild && !isAdmin) {
      this.router.navigate(['/chatbot']);
      return false;
    }

    // normal route role-check
    if (requiredRoles.length === 0) {
      return true;
    }

    const hasRole = requiredRoles.some((r) => userRoles.includes(r));
    if (hasRole) return true;

    // fallback redirects
    this.router.navigate(['/chatbot']);

    return false;
  }
}
