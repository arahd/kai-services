import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { of } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
import { HrPermissionService } from '../hr-portal-services/hr-permission.service';
import { hrAdminGuard, hrResumeGuard, hrVisaGuard } from './hr-admin.guard';

describe('HR Portal Route Guards', () => {
  let routerMock: jasmine.SpyObj<Router>;
  let toastServiceMock: jasmine.SpyObj<ToastService>;
  let hrPermissionServiceMock: any;

  const routeDummy = {} as ActivatedRouteSnapshot;
  const stateDummy = {} as RouterStateSnapshot;

  beforeEach(() => {
    routerMock = jasmine.createSpyObj('Router', ['navigate']);
    toastServiceMock = jasmine.createSpyObj('ToastService', ['show']);
    hrPermissionServiceMock = {
      loadAccessControl: jasmine.createSpy('loadAccessControl').and.returnValue(
        of({
          is_admin: false,
          resume_internal: true,
          resume_offshore: false,
          resume_onsite: false,
          visa_business: false,
          visa_ict: false,
          visa_extension: false,
        })
      ),
      isAdmin: jasmine.createSpy('isAdmin').and.returnValue(false),
      hasAnyResumeAccess: jasmine.createSpy('hasAnyResumeAccess').and.returnValue(true),
      hasAnyVisaAccess: jasmine.createSpy('hasAnyVisaAccess').and.returnValue(false),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: HrPermissionService, useValue: hrPermissionServiceMock },
      ],
    });
  });

  describe('hrAdminGuard', () => {
    it('should block non-admin and redirect to /hrportal/jd', (done) => {
      TestBed.runInInjectionContext(() => {
        const result$ = hrAdminGuard(routeDummy, stateDummy) as any;
        result$.subscribe((canActivate: boolean) => {
          expect(canActivate).toBeFalse();
          expect(routerMock.navigate).toHaveBeenCalledWith(['/hrportal/jd']);
          expect(toastServiceMock.show).toHaveBeenCalledWith(
            'Access Restricted: Admin privileges required.',
            'error'
          );
          done();
        });
      });
    });
  });

  describe('hrResumeGuard', () => {
    it('should allow access if user has resume permissions', (done) => {
      TestBed.runInInjectionContext(() => {
        const result$ = hrResumeGuard(routeDummy, stateDummy) as any;
        result$.subscribe((canActivate: boolean) => {
          expect(canActivate).toBeTrue();
          expect(routerMock.navigate).not.toHaveBeenCalled();
          done();
        });
      });
    });
  });

  describe('hrVisaGuard', () => {
    it('should block access and redirect if user has no visa permissions', (done) => {
      TestBed.runInInjectionContext(() => {
        const result$ = hrVisaGuard(routeDummy, stateDummy) as any;
        result$.subscribe((canActivate: boolean) => {
          expect(canActivate).toBeFalse();
          expect(routerMock.navigate).toHaveBeenCalledWith(['/hrportal/jd']);
          expect(toastServiceMock.show).toHaveBeenCalledWith(
            'Access Restricted: You do not have permission to access Visa Processing.',
            'error'
          );
          done();
        });
      });
    });
  });
});
