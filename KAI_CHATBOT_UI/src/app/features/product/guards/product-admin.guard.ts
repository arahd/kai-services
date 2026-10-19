import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';

/**
 * Route guard for Products Admin module.
 * Requires product_roles to contain `is_product_admin`.
 */
export const productAdminGuard: CanActivateFn = (_route, _state) => {
  const tokenService = inject(TokenService);
  const router = inject(Router);
  const toastService = inject(ToastService);

  if (tokenService.isProductAdmin()) {
    return true;
  }

  toastService.show('Access Restricted: Product Admin privileges required.', 'error');
  router.navigate(['/product']);
  return false;
};
