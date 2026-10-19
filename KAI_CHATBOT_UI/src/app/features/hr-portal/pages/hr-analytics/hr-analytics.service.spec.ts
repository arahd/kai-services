import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HrAnalyticsService } from './hr-analytics.service';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';

describe('HrAnalyticsService', () => {
  let service: HrAnalyticsService;
  let httpMock: HttpTestingController;

  const mockConfigService = {
    getHrPortalUrl: () => 'https://api.test.com/api',
  };

  const mockTokenService = {
    getToken: () => 'mock-token',
  };

  const mockStorageService = {
    getJwtToken: () => 'mock-jwt-token',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HrAnalyticsService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: SessionStorageService, useValue: mockStorageService },
      ],
    });

    service = TestBed.inject(HrAnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('1. GET /api/hr/dashboard (getDashboardOverview)', () => {
    it('should fetch overview data from /hr/dashboard', () => {
      const mockOverview = {
        summary: {
          active_users: 7,
          average_tokens: 2301.95,
          failed_reports: 18,
          jd_analysis_count: 23,
          success_rate: 69.33,
          successful_reports: 52,
          total_reports: 75,
          total_tokens_used: 172646,
        },
        module_cards: [
          { count: 22, process: 'Resume', process_type: 'Formatter' },
          { count: 23, process: 'Resume', process_type: 'JD Analysis' },
        ],
        status_distribution: { failed: 18, success: 52 },
        module_distribution: [
          { count: 7, module: 'Visa' },
          { count: 68, module: 'Resume' },
        ],
      };

      service.getDashboardOverview({ module: 'Resume', user: 'all' }).subscribe((res) => {
        expect(res.summary.total_reports).toBe(75);
        expect(res.module_cards.length).toBe(2);
        expect(res.status_distribution.success).toBe(52);
        expect(res.module_distribution.length).toBe(2);
      });

      const req = httpMock.expectOne((r) => r.url.includes('/hr/dashboard') && !r.url.includes('report-trend'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('module')).toBe('Resume');
      req.flush(mockOverview);
    });
  });

  describe('2. GET /api/hr/dashboard/report-trend (getReportTrend)', () => {
    it('should fetch report trend data from /hr/dashboard/report-trend', () => {
      const mockTrend = {
        success: true,
        data: [
          { date: '2026-08-27', Resume_Formatter: 8, 'Resume_JD Analysis': 11 },
          { date: '2026-08-28', 'Resume_JD Analysis': 5 },
        ],
      };

      service.getReportTrend().subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data.length).toBe(2);
        expect(res.data[0]['Resume_Formatter']).toBe(8);
      });

      const req = httpMock.expectOne((r) => r.url.includes('/hr/dashboard/report-trend'));
      expect(req.request.method).toBe('GET');
      req.flush(mockTrend);
    });
  });

  describe('3. GET /api/hr/dashboard/top-users (getTopUsers)', () => {
    it('should fetch top users from /hr/dashboard/top-users', () => {
      const mockTopUsers = {
        success: true,
        data: [
          {
            rank: 1,
            user: 'bhavadharani.arumugam@kumaran.world',
            module: 'Resume',
            tokens: 0,
            report_count: 18,
          },
        ],
      };

      service.getTopUsers().subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data.length).toBe(1);
        expect(res.data[0].user).toBe('bhavadharani.arumugam@kumaran.world');
        expect(res.data[0].report_count).toBe(18);
      });

      const req = httpMock.expectOne((r) => r.url.includes('/hr/dashboard/top-users'));
      expect(req.request.method).toBe('GET');
      req.flush(mockTopUsers);
    });
  });

  describe('4. GET /api/hr/dashboard/recent-activity (getRecentActivity)', () => {
    it('should fetch recent activity from /hr/dashboard/recent-activity', () => {
      const mockRecent = {
        success: true,
        data: [
          {
            created_date: '2026-08-28 09:14:51.925279',
            email_id: 'bhavadharani.arumugam@kumaran.world',
            process: 'Resume',
            process_type: 'JD Analysis',
            status: null,
            token_used: 0,
            uploaded_file_name: '04_engineering_manager_job_description.pdf',
          },
        ],
      };

      service.getRecentActivity().subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data.length).toBe(1);
        expect(res.data[0].uploaded_file_name).toBe('04_engineering_manager_job_description.pdf');
      });

      const req = httpMock.expectOne((r) => r.url.includes('/hr/dashboard/recent-activity'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('tz')).toBeTruthy();
      expect(req.request.headers.get('X-Timezone')).toBeTruthy();
      req.flush(mockRecent);
    });
  });

  describe('Aggregated getDashboardData()', () => {
    it('should call all 4 split endpoints and combine them into HRAnalyticsDashboardData', () => {
      service.getDashboardData().subscribe((data) => {
        expect(data.kpis.totalRequests.value).toBe('75');
        expect(data.kpis.successRate.value).toBe('69.3%');
        expect(data.kpis.failedRequests.value).toBe('18');
        expect(data.moduleCards.length).toBe(2);
        expect(data.trends.categories.length).toBe(2);
        expect(data.trends.series.length).toBe(2);
        expect(data.topUsers.length).toBe(1);
        expect(data.recentActivities.length).toBe(1);
        expect(data.recentActivities[0].status).toBe('Success');
      });

      const reqOverview = httpMock.expectOne((r) => r.url.endsWith('/hr/dashboard'));
      const reqTrend = httpMock.expectOne((r) => r.url.endsWith('/hr/dashboard/report-trend'));
      const reqTop = httpMock.expectOne((r) => r.url.endsWith('/hr/dashboard/top-users'));
      const reqRecent = httpMock.expectOne((r) => r.url.endsWith('/hr/dashboard/recent-activity'));
      expect(reqRecent.request.params.get('tz')).toBeTruthy();
      expect(reqRecent.request.headers.get('X-Timezone')).toBeTruthy();

      reqOverview.flush({
        summary: {
          active_users: 7,
          average_tokens: 2301.95,
          failed_reports: 18,
          jd_analysis_count: 23,
          success_rate: 69.33,
          successful_reports: 52,
          total_reports: 75,
          total_tokens_used: 172646,
        },
        module_cards: [
          { count: 22, process: 'Resume', process_type: 'Formatter' },
          { count: 23, process: 'Resume', process_type: 'JD Analysis' },
        ],
        status_distribution: { failed: 18, success: 52 },
        module_distribution: [{ count: 75, module: 'Resume' }],
      });

      reqTrend.flush({
        success: true,
        data: [
          { date: '2026-08-27', Resume_Formatter: 8, 'Resume_JD Analysis': 11 },
          { date: '2026-08-28', 'Resume_JD Analysis': 5 },
        ],
      });

      reqTop.flush({
        success: true,
        data: [
          {
            rank: 1,
            user: 'bhavadharani.arumugam@kumaran.world',
            module: 'Resume',
            tokens: 0,
            report_count: 18,
          },
        ],
      });

      reqRecent.flush({
        success: true,
        data: [
          {
            created_date: '2026-08-28 09:14:51.925279',
            email_id: 'bhavadharani.arumugam@kumaran.world',
            process: 'Resume',
            process_type: 'JD Analysis',
            status: null,
            token_used: 0,
            uploaded_file_name: '04_engineering_manager_job_description.pdf',
          },
        ],
      });
    });
  });
});
