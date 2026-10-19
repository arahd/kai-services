import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HrAnalyticsComponent } from './hr-analytics.component';
import { HrAnalyticsService } from './hr-analytics.service';
import { of } from 'rxjs';
import { HRAnalyticsDashboardData } from './hr-analytics.model';

describe('HrAnalyticsComponent', () => {
  let component: HrAnalyticsComponent;
  let fixture: ComponentFixture<HrAnalyticsComponent>;
  let analyticsServiceMock: jasmine.SpyObj<HrAnalyticsService>;

  const mockDashboardData: HRAnalyticsDashboardData = {
    kpis: {
      totalRequests: { title: 'Total Requests', value: '75' },
      successRate: { title: 'Success Rate', value: '69.3%' },
      failedRequests: { title: 'Failed Requests', value: '18' },
      totalTokensUsed: { title: 'Total Tokens Used', value: '172,646' },
      activeHrUsers: { title: 'Active HR Users', value: '7 Users' },
      averageTokens: { title: 'Average Tokens / Report', value: '2,301.95' },
      jdAnalysisCount: { title: 'JD Analysis Count', value: '23' },
    },
    moduleCards: [
      { process: 'Resume', process_type: 'Formatter', count: 22 },
      { process: 'Resume', process_type: 'JD Analysis', count: 23 },
    ],
    moduleDistribution: [
      { module: 'Visa', count: 7 },
      { module: 'Resume', count: 68 },
    ],
    trends: {
      categories: ['Aug 27', 'Aug 28'],
      series: [
        { name: 'Resume Formatter', data: [8, 0] },
        { name: 'Resume JD Analysis', data: [11, 5] },
      ],
      totalCounts: [19, 5],
    },
    successFailureRatio: {
      success: 52,
      failed: 18,
    },
    topUsers: [
      {
        rank: 1,
        user: 'bhavadharani.arumugam@kumaran.world',
        module: 'Resume',
        tokens: '0',
        reportCount: 18,
      },
    ],
    recentActivities: [
      {
        sNo: 1,
        id: 1,
        createdDate: '28 Aug 2026, 09:14 AM',
        date: '28 Aug 2026,',
        time: '09:14 AM',
        user: 'bhavadharani.arumugam@kumaran.world',
        module: 'Resume',
        processType: 'JD Analysis',
        uploadedFileName: '04_engineering_manager_job_description.pdf',
        uploadedFiles: ['04_engineering_manager_job_description.pdf'],
        tokensUsed: '0',
        status: 'Success',
      },
    ],
  };

  beforeEach(async () => {
    analyticsServiceMock = jasmine.createSpyObj('HrAnalyticsService', [
      'getDashboardData',
      'getUsers',
      'getModules',
      'getProcessTypes',
    ]);

    analyticsServiceMock.getDashboardData.and.returnValue(of(mockDashboardData));
    analyticsServiceMock.getUsers.and.returnValue(of(['user1@test.com', 'user2@test.com']));
    analyticsServiceMock.getModules.and.returnValue(of(['Resume', 'Visa']));

    await TestBed.configureTestingModule({
      imports: [HrAnalyticsComponent],
      providers: [{ provide: HrAnalyticsService, useValue: analyticsServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(HrAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component and load initial data', () => {
    expect(component).toBeTruthy();
    expect(analyticsServiceMock.getDashboardData).toHaveBeenCalled();
    expect(component.dashboardData()).toEqual(mockDashboardData);
    expect(component.userOptions().length).toBe(2);
    expect(component.moduleOptions().length).toBe(2);
  });

  it('should configure charts based on loaded dashboard data', () => {
    expect(component.donutChartOptions.series).toEqual([52, 18]);
    expect(component.lineChartOptions.series.length).toBe(2);
    expect(component.lineChartOptions.xaxis.categories).toEqual(['Aug 27', 'Aug 28']);
  });

  it('should reload data when filter changes', () => {
    component.startDate.set('2026-08-01');
    component.selectedModule.set('Resume');
    component.onFilterChange();

    expect(analyticsServiceMock.getDashboardData).toHaveBeenCalledWith({
      fromDate: '2026-08-01',
      toDate: undefined,
      module: 'Resume',
      user: 'all',
    });
  });

  it('should reset filters and reload data on resetFilters()', () => {
    component.startDate.set('2026-08-01');
    component.endDate.set('2026-08-30');
    component.selectedModule.set('Visa');
    component.selectedUser.set('user1@test.com');

    component.resetFilters();

    expect(component.startDate()).toBe('');
    expect(component.endDate()).toBe('');
    expect(component.selectedModule()).toBe('all');
    expect(component.selectedUser()).toBe('all');
    expect(analyticsServiceMock.getDashboardData).toHaveBeenCalled();
  });
});
