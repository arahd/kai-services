import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HrPermissionService } from './hr-permission.service';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { HrUserAccess } from '../models/hr-access.model';

describe('HrPermissionService', () => {
  let service: HrPermissionService;
  let httpMock: HttpTestingController;

  const mockConfigService = {
    getHrPortalUrl: () => 'https://hrportal.test',
  };

  const mockSessionStorage = {
    getItem: jasmine.createSpy().and.returnValue(null),
    setItem: jasmine.createSpy(),
    getJwtToken: () => 'mock-jwt-token',
  };

  const mockTokenService = {
    getToken: () => 'mock-token',
    isHrAdmin: () => true,
    isAdmin: () => false,
    getUserInfo: () => ({ email: 'test@kumaran.com', name: 'Test User' }),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HrPermissionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SessionStorageService, useValue: mockSessionStorage },
        { provide: TokenService, useValue: mockTokenService },
      ],
    });

    service = TestBed.inject(HrPermissionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should bypass HTTP call and return fallback access when user is not hr admin', (done) => {
    mockTokenService.isHrAdmin = () => false;

    service.loadAccessControl().subscribe((res) => {
      expect(res).toBeTruthy();
      expect(res?.is_admin).toBeFalse();
      expect(service.hasAnyResumeAccess()).toBeFalse();
      expect(service.hasAnyVisaAccess()).toBeFalse();
      done();
    });

    // No HTTP request should be made when isHrAdmin returns false
    httpMock.expectNone('https://hrportal.test/api/hr/access-control');
  });

  it('should load access control permissions via GET /api/hr/access-control when isHrAdmin', (done) => {
    mockTokenService.isHrAdmin = () => true;

    const mockAccess: HrUserAccess = {
      email_id: 'charulatha.hariharan@kumaran.world',
      is_admin: true,
      resume_internal: false,
      resume_offshore: true,
      resume_onsite: false,
      visa_business: false,
      visa_extension: false,
      visa_ict: true,
      success: true,
      user_name: 'Charulatha Hariharan',
    };

    service.loadAccessControl().subscribe((res) => {
      expect(res).toEqual(mockAccess);
      expect(service.currentUserAccess()).toEqual(mockAccess);
      expect(service.isAdmin()).toBeTrue();
      expect(service.hasVisaAccess('ict')).toBeTrue();
      expect(service.hasResumeAccess('offshore')).toBeTrue();
      expect(service.hasResumeAccess('internal')).toBeFalse();
      expect(service.hasVisaAccess('business')).toBeFalse();
      done();
    });

    const req = httpMock.expectOne('https://hrportal.test/hr/access-control');
    expect(req.request.method).toBe('GET');
    req.flush(mockAccess);
  });

  it('should return false for visa access when user is admin but has all visa flags false', (done) => {
    mockTokenService.isHrAdmin = () => true;

    const userPayload: HrUserAccess = {
      email_id: 'sridhar.baskar@kumaran.world',
      is_admin: true,
      resume_internal: true,
      resume_offshore: true,
      resume_onsite: true,
      visa_business: false,
      visa_extension: false,
      visa_ict: false,
      success: true,
      user_name: 'Sridhar Baskar',
    };

    service.loadAccessControl(true).subscribe(() => {
      expect(service.isAdmin()).toBeTrue();
      expect(service.hasVisaAccess('business')).toBeFalse();
      expect(service.hasVisaAccess('ict')).toBeFalse();
      expect(service.hasVisaAccess('extension')).toBeFalse();
      expect(service.hasAnyVisaAccess()).toBeFalse();
      expect(service.hasAnyResumeAccess()).toBeTrue();
      done();
    });

    const req = httpMock.expectOne('https://hrportal.test/hr/access-control');
    expect(req.request.method).toBe('GET');
    req.flush(userPayload);
  });

  it('should reflect isAdmin as false when is_admin in access-control response is false', (done) => {
    mockTokenService.isHrAdmin = () => true;

    const mockAccess: HrUserAccess = {
      email_id: 'standard.user@kumaran.world',
      is_admin: false,
      resume_internal: true,
      resume_offshore: false,
      resume_onsite: false,
      visa_business: false,
      visa_extension: false,
      visa_ict: false,
      success: true,
      user_name: 'Standard User',
    };

    service.loadAccessControl(true).subscribe((res) => {
      expect(res?.is_admin).toBeFalse();
      expect(service.isAdmin()).toBeFalse();
      done();
    });

    const req = httpMock.expectOne('https://hrportal.test/hr/access-control');
    expect(req.request.method).toBe('GET');
    req.flush(mockAccess);
  });
});
