import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';
import { productAdminGuard } from './product-admin.guard';

describe('productAdminGuard', () => {
  let mockTokenService: jasmine.SpyObj<TokenService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockToastService: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    mockTokenService = jasmine.createSpyObj('TokenService', ['isProductAdmin']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockToastService = jasmine.createSpyObj('ToastService', ['show']);

    TestBed.configureTestingModule({
      providers: [
        { provide: TokenService, useValue: mockTokenService },
        { provide: Router, useValue: mockRouter },
        { provide: ToastService, useValue: mockToastService },
      ],
    });
  });

  it('should allow activation if user has product admin role', () => {
    mockTokenService.isProductAdmin.and.returnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      productAdminGuard(null as any, null as any),
    );

    expect(result).toBeTrue();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should block activation and redirect if user does not have product admin role', () => {
    mockTokenService.isProductAdmin.and.returnValue(false);

    const result = TestBed.runInInjectionContext(() =>
      productAdminGuard(null as any, null as any),
    );

    expect(result).toBeFalse();
    expect(mockToastService.show).toHaveBeenCalledWith(
      'Access Restricted: Product Admin privileges required.',
      'error',
    );
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/product']);
  });
});
