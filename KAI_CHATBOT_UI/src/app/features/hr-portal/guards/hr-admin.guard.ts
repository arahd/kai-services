import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ToastService } from '@core/services/toast.service';
import { HrPermissionService } from '../hr-portal-services/hr-permission.service';
import { map } from 'rxjs';

/**
 * Route guard for Admin Control module. Requires `is_admin: true`.
 */
export const hrAdminGuard: CanActivateFn = (route, state) => {
  const hrPermission = inject(HrPermissionService);
  const router = inject(Router);
  const toastService = inject(ToastService);

  return hrPermission.loadAccessControl().pipe(
    map((access) => {
      const isAdmin = !!access?.is_admin || hrPermission.isAdmin();
      if (isAdmin) {
        return true;
      }
      toastService.show('Access Restricted: Admin privileges required.', 'error');
      router.navigate(['/hrportal/jd']);
      return false;
    })
  );
};

/**
 * Route guard for Resume Standardizer module. Requires at least one resume permission.
 */
export const hrResumeGuard: CanActivateFn = (route, state) => {
  const hrPermission = inject(HrPermissionService);
  const router = inject(Router);
  const toastService = inject(ToastService);

  return hrPermission.loadAccessControl().pipe(
    map(() => {
      if (hrPermission.hasAnyResumeAccess()) {
        return true;
      }
      toastService.show(
        'Access Restricted: You do not have permission to access Resume Standardizer.',
        'error'
      );
      router.navigate(['/hrportal/jd']);
      return false;
    })
  );
};

/**
 * Route guard for Visa Processing module. Requires at least one visa permission.
 */
export const hrVisaGuard: CanActivateFn = (route, state) => {
  const hrPermission = inject(HrPermissionService);
  const router = inject(Router);
  const toastService = inject(ToastService);

  return hrPermission.loadAccessControl().pipe(
    map(() => {
      if (hrPermission.hasAnyVisaAccess()) {
        return true;
      }
      toastService.show(
        'Access Restricted: You do not have permission to access Visa Processing.',
        'error'
      );
      router.navigate(['/hrportal/jd']);
      return false;
    })
  );
};
