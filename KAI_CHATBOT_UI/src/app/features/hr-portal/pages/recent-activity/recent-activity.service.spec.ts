import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RecentActivityService } from './recent-activity.service';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';

describe('RecentActivityService', () => {
  let service: RecentActivityService;
  let httpMock: HttpTestingController;
  let configServiceMock: jasmine.SpyObj<ConfigService>;
  let tokenServiceMock: jasmine.SpyObj<TokenService>;
  let sessionStorageMock: jasmine.SpyObj<SessionStorageService>;

  beforeEach(() => {
    configServiceMock = jasmine.createSpyObj('ConfigService', ['getHrPortalUrl']);
    configServiceMock.getHrPortalUrl.and.returnValue('https://kai-dev.kumaran.ai/hr-portal/api');

    tokenServiceMock = jasmine.createSpyObj('TokenService', ['getToken', 'getUserInfo']);
    tokenServiceMock.getToken.and.returnValue('mock-token-123');
    tokenServiceMock.getUserInfo.and.returnValue({ email: 'user@company.com' });

    sessionStorageMock = jasmine.createSpyObj('SessionStorageService', ['getJwtToken']);
    sessionStorageMock.getJwtToken.and.returnValue('mock-jwt');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        RecentActivityService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: SessionStorageService, useValue: sessionStorageMock },
      ],
    });

    service = TestBed.inject(RecentActivityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should resolve download URL correctly', () => {
    const downloadUrl = '/api/resume_db/download/resume-builder/2026-08-27/test.pdf';
    expect(service.buildDownloadUrl(downloadUrl)).toBe('https://kai-dev.kumaran.ai/hr-portal/api/resume_db/download/resume-builder/2026-08-27/test.pdf');
  });

  it('should download file by URL', () => {
    const downloadUrl = '/api/resume_db/download/resume-builder/2026-08-27/test.pdf';
    const mockBlob = new Blob(['pdf-content']);

    service.downloadFile(downloadUrl).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne('https://kai-dev.kumaran.ai/hr-portal/api/resume_db/download/resume-builder/2026-08-27/test.pdf');
    expect(req.request.method).toBe('GET');
    req.flush(mockBlob);
  });

  it('should fetch user recent activity', () => {
    service.getUserRecentActivity().subscribe((result) => {
      expect(result.records.length).toBe(1);
      expect(result.records[0].module).toBe('Resume Standardizer');
      expect(result.records[0].processType).toBe('Resume Formatter');
      expect(result.totalCount).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url.includes('/hr/history/recent-activity') &&
        r.params.get('email_id') === 'user@company.com' &&
        r.params.has('tz'),
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('tz')).toBeTruthy();
    expect(req.request.headers.get('X-Timezone')).toBeTruthy();
    req.flush({
      success: true,
      data: [{ id: 1, date_time: '2026-08-27 10:00:00', module: 'Resume Standardizer', process_type: 'Resume Formatter' }],
      total_count: 1,
    });
  });
});
