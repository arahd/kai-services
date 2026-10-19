import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HrAdminService } from './hr-admin.service';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { CreateHrUserDto, HrUsersListResponse, UpdateHrUserDto } from '../models/hr-access.model';

describe('HrAdminService', () => {
  let service: HrAdminService;
  let httpMock: HttpTestingController;

  const mockConfigService = {
    getHrPortalUrl: () => 'https://hrportal.test',
  };

  const mockSessionStorage = {
    getItem: jasmine.createSpy().and.returnValue(null),
    getJwtToken: () => 'mock-jwt-token',
  };

  const mockTokenService = {
    getToken: () => 'mock-token',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HrAdminService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SessionStorageService, useValue: mockSessionStorage },
        { provide: TokenService, useValue: mockTokenService },
      ],
    });

    service = TestBed.inject(HrAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch users list via GET /api/hr/get-users', (done) => {
    const mockResponse: HrUsersListResponse = {
      data: [
        {
          id: 1,
          user_name: 'Diana Michael',
          email_id: 'diana.michael@kumaran.com',
          is_admin: true,
          resume_internal: true,
          resume_offshore: true,
          resume_onsite: true,
          visa_business: true,
          visa_extension: true,
          visa_ict: true,
        },
      ],
      success: true,
    };

    service.getUsers().subscribe((res) => {
      expect(res.data.length).toBe(1);
      expect(res.data[0].user_name).toBe('Diana Michael');
      done();
    });

    const req = httpMock.expectOne('https://hrportal.test/hr/get-users');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should create user via POST /hr/create-user', (done) => {
    const payload: CreateHrUserDto = {
      user_name: 'Test User',
      email_id: 'test.user@kumaran.com',
      is_admin: false,
      resume_offshore: true,
      resume_onsite: true,
      resume_internal: false,
      visa_ict: true,
      visa_business: false,
      visa_extension: false,
    };

    service.createUser(payload).subscribe((res) => {
      expect(res.success).toBeTrue();
      expect(res.message).toBe('User created successfully');
      done();
    });

    const req = httpMock.expectOne('https://hrportal.test/hr/create-user');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, message: 'User created successfully' });
  });

  it('should update user via PUT /hr/users/{id}', (done) => {
    const payload: UpdateHrUserDto = {
      user_name: 'Diana Michael Updated',
      is_admin: false,
    };

    service.updateUser(1, payload).subscribe((res) => {
      expect(res.success).toBeTrue();
      done();
    });

    const req = httpMock.expectOne('https://hrportal.test/hr/users/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true });
  });

  it('should delete user via DELETE /hr/users/{id}', (done) => {
    service.deleteUser(1).subscribe((res) => {
      expect(res.success).toBeTrue();
      done();
    });

    const req = httpMock.expectOne('https://hrportal.test/hr/users/1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });
});
