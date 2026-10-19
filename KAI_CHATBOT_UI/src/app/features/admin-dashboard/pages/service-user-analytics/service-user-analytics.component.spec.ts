import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ServiceUserAnalyticsComponent } from './service-user-analytics.component';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ToastService } from '@core/services/toast.service';
import { Router } from '@angular/router';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { TokenService } from '@core/services/token.service';
import { ReportingApiService } from '@features/admin-dashboard/services/reporting-api.service';

describe('ServiceUserAnalyticsComponent', () => {
  let component: ServiceUserAnalyticsComponent;
  let fixture: ComponentFixture<ServiceUserAnalyticsComponent>;
  let toastServiceMock: jasmine.SpyObj<ToastService>;
  let chatServiceMock: jasmine.SpyObj<ChatService>;
  let reportingApiMock: any;

  beforeEach(async () => {
    toastServiceMock = jasmine.createSpyObj('ToastService', ['show']);
    chatServiceMock = jasmine.createSpyObj('ChatService', [
      'getApiUserReportDetails',
      'getReportingModels',
      'getPendingUserDetails',
      'getRegisteredUserDetails',
      'getRevokedUsers',
      'getUserTokensDetails',
      'searchReportingUsers',
      'exportAllUsersXlsx',
      'exportQuestionsXlsx',
      'getFilterProjectIds'
    ]);

    reportingApiMock = {
      getProjectList: jasmine.createSpy('getProjectList').and.returnValue(
        of({
          data: [{ tokens_used_today: 100, requests_used_today: 2 }],
          total: 1,
        })
      ),
      getApiUserReportDetails: jasmine.createSpy('getApiUserReportDetails').and.returnValue(of({ filtered_summary: [], user_details: [] })),
      getReportingModels: jasmine.createSpy('getReportingModels').and.returnValue(of({ report_gpt_model: [] })),
      getPendingUserDetails: jasmine.createSpy('getPendingUserDetails').and.returnValue(of([])),
      getRegisteredUserDetails: jasmine.createSpy('getRegisteredUserDetails').and.returnValue(of([])),
      getRevokedUsers: jasmine.createSpy('getRevokedUsers').and.returnValue(of([])),
      getUserTokensDetails: jasmine.createSpy('getUserTokensDetails').and.returnValue(of([])),
      getOverallTokensUsage: jasmine.createSpy('getOverallTokensUsage').and.returnValue(of({})),
    };

    chatServiceMock.getFilterProjectIds.and.returnValue(of({ project_id: ['proj-1', 'proj-2'] }));
    chatServiceMock.getApiUserReportDetails.and.returnValue(
      of({
        filtered_summary: [],
        user_details: [
          {
            username: 'valid.user@kumaran.world',
            project_id: 'proj-1',
            total_user_query: 1,
            tokens_used: 10,
            model_wise_token_usuage: [],
          },
          {
            username: 'other.user@kumaran.world',
            project_id: 'proj-2',
            total_user_query: 2,
            tokens_used: 20,
            model_wise_token_usuage: [],
          },
        ],
      }),
    );
    chatServiceMock.getReportingModels.and.returnValue(of({ report_gpt_model: [{ value: 'gpt-4', displayName: 'GPT-4' }] }));
    chatServiceMock.getPendingUserDetails.and.returnValue(of([]));
    chatServiceMock.getRegisteredUserDetails.and.returnValue(of([]));
    chatServiceMock.getRevokedUsers.and.returnValue(of([]));
    chatServiceMock.getUserTokensDetails.and.returnValue(of([]));
    chatServiceMock.searchReportingUsers.and.returnValue(of({ username: ['valid.user@kumaran.world'] }));
    chatServiceMock.exportAllUsersXlsx.and.returnValue(of(new Blob(['test'])));
    chatServiceMock.exportQuestionsXlsx.and.returnValue(of(new Blob(['test'])));

    await TestBed.configureTestingModule({
      imports: [ServiceUserAnalyticsComponent],
      providers: [
        { provide: ChatService, useValue: chatServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: AzureAdService, useValue: { logout: jasmine.createSpy('logout') } },
        { provide: TokenService, useValue: { getUserInfo: () => null } },
        {
          provide: ReportingApiService,
          useValue: reportingApiMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceUserAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should block apply when username search text was not selected from suggestions', () => {
    component.userSearchInput = 'invalid-random-user';
    component.filterForm.patchValue({ usernames: [] });

    component.applyFiltersFromModal();

    expect(toastServiceMock.show).toHaveBeenCalledWith(
      'Please select a valid username from the search suggestions, or clear the username search field.',
      'error',
    );
    expect(component.usernameFilterError).toContain('Please select a valid username');
  });

  it('should only show users that match selected usernames in filter results', () => {
    component.filterForm.patchValue({
      usernames: ['valid.user@kumaran.world'],
    });

    component.applyFiltersFromModal();

    expect(chatServiceMock.getApiUserReportDetails).toHaveBeenCalled();
    expect(component.allUsersFilterRows.length).toBe(1);
    expect(component.allUsersFilterRows[0].username).toBe('valid.user@kumaran.world');
  });

  it('should show at most five client secret page buttons per block', () => {
    component.clientSecretsTotalPages = 23;
    component.clientSecretsPage = 1;
    expect(component.clientSecretsPageNumbers).toEqual([1, 2, 3, 4, 5]);

    component.clientSecretsPage = 6;
    expect(component.clientSecretsPageNumbers).toEqual([6, 7, 8, 9, 10]);

    component.clientSecretsPage = 21;
    expect(component.clientSecretsPageNumbers).toEqual([21, 22, 23]);
  });

  it('should show at most five revoked users page buttons per block', () => {
    component.revokedUsersTotalPages = 12;
    component.revokedUsersPage = 5;
    expect(component.revokedUsersPageNumbers).toEqual([1, 2, 3, 4, 5]);

    component.revokedUsersPage = 6;
    expect(component.revokedUsersPageNumbers).toEqual([6, 7, 8, 9, 10]);
  });

  it('should add and remove username filters', () => {
    component.addUsername('user1@kumaran.world');
    expect(component.filterForm.get('usernames')?.value).toContain('user1@kumaran.world');

    component.removeUsername('user1@kumaran.world');
    expect(component.filterForm.get('usernames')?.value).not.toContain('user1@kumaran.world');
  });

  it('should clear all filters', () => {
    component.addUsername('user1');
    component.clearFilters();
    expect(component.filterForm.get('usernames')?.value).toEqual([]);
    expect(component.userSearchInput).toBe('');
  });

  it('should handle sorting filter results', () => {
    component.toggleFilterResultsSort('total_tokens');
    expect(component.filterResultsSortColumn).toBe('total_tokens');
    expect(component.filterResultsSortDir).toBe('asc');

    component.toggleFilterResultsSort('total_tokens');
    expect(component.filterResultsSortDir).toBe('desc');
  });

  it('should toggle filters panel and view user details', () => {
    component.toggleFiltersPanel();
    expect(component.showFiltersPanel()).toBeTrue();

    component.viewFilterUserDetail('valid.user@kumaran.world');
    expect(component.drilledDetailUsername).toBe('valid.user@kumaran.world');

    component.backToAllUsersFilterResults();
    expect(component.drilledDetailUsername).toBeNull();
  });

  it('should call reportingApi.getProjectList to load token usage snapshot instead of chatService.getUserTokensDetails', () => {
    reportingApiMock.getProjectList.calls.reset();
    chatServiceMock.getUserTokensDetails.calls.reset();

    (component as any).loadTokenUsageSnapshot();

    expect(reportingApiMock.getProjectList).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      page: '1',
      limit: '10',
    });
    expect(chatServiceMock.getUserTokensDetails).not.toHaveBeenCalled();
    expect(component.accessControlTokensUsedToday).toBe(100);
    expect(component.accessControlAvgTokensPerRequest).toBe(50);
  });

  it('should call reportingApi.getProjectList once in loadInitialProjectsData and populate clientSecrets and dailyTokenUsageRows', () => {
    reportingApiMock.getProjectList.calls.reset();

    component.loadInitialProjectsData();

    expect(reportingApiMock.getProjectList).toHaveBeenCalledTimes(1);
    expect(reportingApiMock.getProjectList).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      page: '1',
      limit: '10',
    });
    expect(component.clientSecrets.length).toBeGreaterThan(0);
    expect(component.dailyTokenUsageRows.length).toBeGreaterThan(0);
    expect(component.tokenUsage.length).toBeGreaterThan(0);
  });
});
