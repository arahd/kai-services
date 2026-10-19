import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AnalyticsComponent } from '@features/admin-dashboard/pages/analytics/analytics.component';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ToastService } from '@core/services/toast.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { of, throwError } from 'rxjs';

describe('AnalyticsComponent', () => {
  let component: AnalyticsComponent;
  let fixture: ComponentFixture<AnalyticsComponent>;
  let mockChatService: any;
  let mockToastService: any;
  let mockAzureAdService: any;

  beforeEach(async () => {
    mockChatService = {
      getUserTokensDetails: jasmine.createSpy('getUserTokensDetails').and.returnValue(of({ active_user_count: 42 })),
      getRevokedUsers: jasmine.createSpy('getRevokedUsers').and.returnValue(of({ total: 5 })),
      getModelUsage: jasmine.createSpy('getModelUsage').and.returnValue(of([
        { date: '2026-08-01', questions_count: 10, gpt_model: 'gpt-4' }
      ])),
      getReportingAnalytics: jasmine.createSpy('getReportingAnalytics').and.returnValue(of({
        active_user_count: 42,
        regional_distribution: { US: 100, EU: 50 },
        model_distribution: [{ model_name: 'gpt-4', conversation_count: 30 }]
      })),
      getReportingModels: jasmine.createSpy('getReportingModels').and.returnValue(of({
        report_gpt_model: [{ value: 'gpt-4', displayName: 'GPT-4', isEnabled: true }]
      })),
      searchReportingUsers: jasmine.createSpy('searchReportingUsers').and.returnValue(of({ username: ['user1', 'user2'] })),
      getUserAnalytics: jasmine.createSpy('getUserAnalytics').and.returnValue(of({
        total_questions: 100,
        model_usage: [{ model_name: 'gpt-4', conversation_count: 10 }]
      })),
      exportAllUsersXlsx: jasmine.createSpy('exportAllUsersXlsx').and.returnValue(of(new Blob(['test']))),
      exportQuestionsXlsx: jasmine.createSpy('exportQuestionsXlsx').and.returnValue(of(new Blob(['test']))),
      getReportingLeaderboard: jasmine.createSpy('getReportingLeaderboard').and.returnValue(of({
        rows: [{ rank: 1, username: 'user1', total_tokens: 1000 }],
        total_count: 1
      }))
    };

    mockToastService = {
      show: jasmine.createSpy('show')
    };

    mockAzureAdService = {
      getUserProfile: jasmine.createSpy('getUserProfile').and.returnValue(of({}))
    };

    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ChatService, useValue: mockChatService },
        { provide: ToastService, useValue: mockToastService },
        { provide: AzureAdService, useValue: mockAzureAdService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize on ngOnInit', () => {
    expect(component).toBeTruthy();
    expect(mockChatService.getReportingAnalytics).toHaveBeenCalled();
    expect(mockChatService.getReportingModels).toHaveBeenCalled();
    expect(mockChatService.getRevokedUsers).toHaveBeenCalled();
    const userTokenCalls = mockChatService.getUserTokensDetails.calls
      .allArgs()
      .filter((args: any[]) => args[0] === 1 && args[1] === undefined && args[2] === 10);
    expect(userTokenCalls.length).toBe(1);
    expect(mockChatService.getUserTokensDetails).toHaveBeenCalledWith(1, 'tokens');
  });

  it('should update activeUsersCount via onActiveUserCountChange', () => {
    component.onActiveUserCountChange(55);
    expect(component.activeUsersCount).toBe(55);
  });

  it('should return bar color palette cycling', () => {
    expect(component.barColor(0)).toBe('#6366f1');
    expect(component.barColor(7)).toBe('#6366f1');
  });

  it('should add and remove username filters', () => {
    component.addUsername('alice');
    expect(component.filterForm.get('usernames')?.value).toContain('alice');
    expect(component.getSelectedUsernamesString()).toBe('alice');

    component.addUsername('bob');
    expect(component.getSelectedUsernamesString()).toBe('alice, bob');

    component.removeUsername('alice');
    expect(component.filterForm.get('usernames')?.value).not.toContain('alice');
  });

  it('should search users when input changes', () => {
    const event = { target: { value: 'alice' } } as any;
    component.onUsernameSearchInput(event);
    expect(component.userSearchInput).toBe('alice');
    expect(mockChatService.searchReportingUsers).toHaveBeenCalledWith({ username: 'alice', bot_type: 'kumaran' });

    component.pickUser('alice');
    expect(component.filterForm.get('username')?.value).toBe('alice');
    expect(component.userSearchResults).toEqual([]);
  });

  it('should clear search results when search query is less than 2 chars', () => {
    component.searchUsers('a');
    expect(component.userSearchResults).toEqual([]);
  });

  it('should handle user search error gracefully', () => {
    mockChatService.searchReportingUsers.and.returnValue(throwError(() => new Error('Search failed')));
    component.searchUsers('alice');
    expect(mockToastService.show).toHaveBeenCalledWith('Failed to search users', 'error');
  });

  it('should toggle and clear filters', () => {
    component.toggleFiltersPanel();
    expect(component.showFiltersPanel()).toBeTrue();

    component.clearFilters();
    expect(component.filterForm.get('username')?.value).toBe('');
    expect(component.filterForm.get('usernames')?.value).toEqual([]);
    expect(component.filterForm.get('models')?.value).toEqual([]);
  });

  it('should load user analytics and handle errors', () => {
    component.loadUserAnalytics();
    expect(mockChatService.getUserAnalytics).toHaveBeenCalled();
    expect(component.userAnalytics).toBeDefined();

    mockChatService.getUserAnalytics.and.returnValue(throwError(() => new Error('API Error')));
    component.loadUserAnalytics();
    expect(mockToastService.show).toHaveBeenCalledWith('Failed to load user analytics', 'error');
  });

  it('should call getUserAnalytics only once with filtered payload when models are selected', () => {
    mockChatService.getUserAnalytics.calls.reset();
    mockChatService.getUserAnalytics.and.returnValue(of({
      total_conversations: 5,
      total_questions: 10,
      total_tokens: 1000,
      top_models_used: [{ model_name: 'gpt-4o', questions_count: 10 }],
    }));

    component.filterForm.patchValue({
      models: ['gpt-4o'],
      modelMatchAll: false,
    });

    component.loadUserAnalytics();

    expect(mockChatService.getUserAnalytics).toHaveBeenCalledTimes(1);
    expect(mockChatService.getUserAnalytics).toHaveBeenCalledWith(
      jasmine.objectContaining({
        gpt_model: ['gpt-4o'],
      }),
    );
    expect(component.userModalPieLabels).toEqual(['gpt-4o']);
    expect(component.userModalPieSeries).toEqual([10]);
  });

  it('should handle model usage loading and chart updates', () => {
    component.loadModelUsage();
    expect(mockChatService.getModelUsage).toHaveBeenCalled();
    expect(component.modelUsage.length).toBeGreaterThan(0);

    mockChatService.getModelUsage.and.returnValue(throwError(() => new Error('API Error')));
    component.loadModelUsage();
    expect(mockToastService.show).toHaveBeenCalledWith('Failed to load model usage', 'error');
  });

  it('should export all users xlsx', () => {
    component.exportAllUsers();
    expect(mockChatService.exportAllUsersXlsx).toHaveBeenCalled();
    expect(component.submittingExport()).toBeFalse();

    mockChatService.exportAllUsersXlsx.and.returnValue(throwError(() => new Error('Export Error')));
    component.exportAllUsers();
    expect(mockToastService.show).toHaveBeenCalledWith('Export failed', 'error');
  });

  it('should export questions xlsx', () => {
    component.exportQuestions();
    expect(mockChatService.exportQuestionsXlsx).toHaveBeenCalled();

    mockChatService.exportQuestionsXlsx.and.returnValue(throwError(() => new Error('Export Error')));
    component.exportQuestions();
    expect(mockToastService.show).toHaveBeenCalledWith('Export failed', 'error');
  });

  it('should close user modal and apply filters from modal', () => {
    component.closeUserModal();
    expect(component.showUserModal()).toBeFalse();

    component.applyFiltersFromModal();
    expect(component.showFiltersPanel()).toBeFalse();
    expect(component.showUserModal()).toBeTrue();
  });
});
