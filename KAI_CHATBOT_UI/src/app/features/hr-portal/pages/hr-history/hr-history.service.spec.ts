import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpResponse } from '@angular/common/http';
import { HrHistoryService, HistoryRecordDto } from './hr-history.service';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';

describe('HrHistoryService', () => {
  let service: HrHistoryService;
  let httpMock: HttpTestingController;
  let configServiceMock: jasmine.SpyObj<ConfigService>;
  let tokenServiceMock: jasmine.SpyObj<TokenService>;
  let sessionStorageMock: jasmine.SpyObj<SessionStorageService>;

  beforeEach(() => {
    configServiceMock = jasmine.createSpyObj('ConfigService', ['getHrPortalUrl']);
    configServiceMock.getHrPortalUrl.and.returnValue('https://kai-dev.kumaran.ai/hr-portal/api');

    tokenServiceMock = jasmine.createSpyObj('TokenService', ['getToken']);
    tokenServiceMock.getToken.and.returnValue('mock-token-123');

    sessionStorageMock = jasmine.createSpyObj('SessionStorageService', ['getJwtToken']);
    sessionStorageMock.getJwtToken.and.returnValue('mock-jwt');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        HrHistoryService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: SessionStorageService, useValue: sessionStorageMock },
      ],
    });

    service = TestBed.inject(HrHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('buildDownloadUrl', () => {
    it('should return empty string for empty url', () => {
      expect(service.buildDownloadUrl('')).toBe('');
    });

    it('should return absolute URLs as-is', () => {
      const url = 'https://example.com/test.pdf';
      expect(service.buildDownloadUrl(url)).toBe(url);
    });

    it('should resolve /api/resume_db/download/... without duplicate /api when baseUrl ends with /api', () => {
      const input = '/api/resume_db/download/resume-builder/2026-08-27/RAGURAAMAN_V_M_20260827_154549_0fdca7.pdf';
      const expected = 'https://kai-dev.kumaran.ai/hr-portal/api/resume_db/download/resume-builder/2026-08-27/RAGURAAMAN_V_M_20260827_154549_0fdca7.pdf';
      expect(service.buildDownloadUrl(input)).toBe(expected);
    });

    it('should resolve /resume_db/download/... correctly', () => {
      const input = '/resume_db/download/resume-builder/2026-08-27/test.pdf';
      const expected = 'https://kai-dev.kumaran.ai/hr-portal/api/resume_db/download/resume-builder/2026-08-27/test.pdf';
      expect(service.buildDownloadUrl(input)).toBe(expected);
    });

    it('should resolve blob keys without download prefix', () => {
      const input = 'resume-builder/2026-08-27/test.pdf';
      const expected = 'https://kai-dev.kumaran.ai/hr-portal/api/resume_db/download/resume-builder/2026-08-27/test.pdf';
      expect(service.buildDownloadUrl(input)).toBe(expected);
    });
  });

  describe('downloadFile', () => {
    it('should send GET request with Authorization header and return Blob HttpResponse', () => {
      const downloadUrl = '/api/resume_db/download/resume-builder/2026-08-27/RAGURAAMAN_V_M_20260827_154549_0fdca7.pdf';
      const mockBlob = new Blob(['pdf-content'], { type: 'application/pdf' });

      service.downloadFile(downloadUrl).subscribe((response) => {
        expect(response).toBeTruthy();
        expect(response.body).toEqual(mockBlob);
      });

      const req = httpMock.expectOne('https://kai-dev.kumaran.ai/hr-portal/api/resume_db/download/resume-builder/2026-08-27/RAGURAAMAN_V_M_20260827_154549_0fdca7.pdf');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe('Bearer mock-token-123');
      expect(req.request.responseType).toBe('blob');

      req.flush(mockBlob);
    });
  });

  describe('getHistory', () => {
    it('should send GET request to /hr/history with query params and timezone', () => {
      service.getHistory({ module: 'Resume Standardizer', from_date: '2026-01-01', to_date: '2026-01-31' }).subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data.length).toBe(1);
      });

      const req = httpMock.expectOne((r) => r.url === 'https://kai-dev.kumaran.ai/hr-portal/api/hr/history' && r.params.get('module') === 'Resume Standardizer');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('Page')).toBe('1');
      expect(req.request.params.get('page_size')).toBe('20');
      expect(req.request.params.get('tz')).toBeTruthy();
      expect(req.request.headers.get('X-Timezone')).toBeTruthy();
      req.flush({ success: true, count: 1, total_count: 1, data: [{ id: 1, date_time: '2026-08-27T10:00:00Z' }] });
    });

    it('should send GET request to /hr/history with Page, page, and page_size query params', () => {
      service.getHistory(2, 20, { module: 'Visa Process Check' }).subscribe((res) => {
        expect(res.success).toBeTrue();
      });

      const req = httpMock.expectOne((r) =>
        r.url === 'https://kai-dev.kumaran.ai/hr-portal/api/hr/history' &&
        r.params.get('Page') === '2' &&
        r.params.get('page') === '2' &&
        r.params.get('page_size') === '20' &&
        r.params.get('module') === 'Visa Process Check' &&
        r.params.has('tz')
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('X-Timezone')).toBeTruthy();
      req.flush({ success: true, count: 20, total_count: 45, total_pages: 3, data: [] });
    });
  });

  describe('transformToUIRecord', () => {
    it('should transform DTO into HistoryRecordUI properly', () => {
      const dto: HistoryRecordDto = {
        id: 101,
        date_time: '2026-08-27 15:45:49',
        email_id: 'john.doe@company.com',
        token_used: 1500,
        module: 'Resume Standardizer',
        process_type: 'Internal',
        uploaded_file_name: 'resume.pdf',
        downloaded_file_name: 'standardized.pdf',
        download_url: '/api/resume_db/download/resume-builder/2026-08-27/file.pdf',
        upload_status: 'SUCCESS',
        download_resume_status: 'SUCCESS',
      };

      const ui = service.transformToUIRecord(dto);
      expect(ui.id).toBe(101);
      expect(ui.user).toBe('john.doe@company.com');
      expect(ui.userPrefix).toBe('john.doe');
      expect(ui.userDomain).toBe('@company.com');
      expect(ui.tokenUsed).toBe(1500);
      expect(ui.downloadUrl).toBe('/api/resume_db/download/resume-builder/2026-08-27/file.pdf');
      expect(ui.uploadStatus).toBe('Success');
      expect(ui.downloadStatus).toBe('Success');
    });
  });
});
