import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TokenUsageMonitoringComponent } from './token-usage-monitoring.component';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';
import { of, throwError } from 'rxjs';

describe('TokenUsageMonitoringComponent', () => {
  let component: TokenUsageMonitoringComponent;
  let fixture: ComponentFixture<TokenUsageMonitoringComponent>;
  let mockChatService: any;
  let mockToastService: any;
  let mockTokenService: any;

  beforeEach(async () => {
    mockChatService = {
      getUserTokensDetails: jasmine.createSpy('getUserTokensDetails').and.callFake((page: number = 1) => of({
        data: [{ user_id: 'user1', tokens_used: 100, is_blocked: false, allow_sensitive_search: true }],
        page: page,
        total_pages: 5,
        total_count: 50,
        limit: 10
      })),
      getSortedTokenUsageUsers: jasmine.createSpy('getSortedTokenUsageUsers').and.returnValue(of({
        data: [{ user_id: 'user2', tokens_used: 200, is_blocked: false }],
        page: 1,
        total_pages: 5
      })),
      searchTokenUsageUsers: jasmine.createSpy('searchTokenUsageUsers').and.returnValue(of([
        { user_id: 'user1', tokens_used: 100 }
      ])),
      blockUser: jasmine.createSpy('blockUser').and.returnValue(of({ message: 'Success' })),
      unblockUser: jasmine.createSpy('unblockUser').and.returnValue(of({ message: 'Success' })),
      getSensitiveQuestionsAllowance: jasmine.createSpy('getSensitiveQuestionsAllowance').and.returnValue(of(true)),
      setSensitiveQuestionsAllowance: jasmine.createSpy('setSensitiveQuestionsAllowance').and.returnValue(of({ message: 'Success' }))
    };

    mockToastService = {
      show: jasmine.createSpy('show')
    };

    mockTokenService = {
      getUserInfo: jasmine.createSpy('getUserInfo').and.returnValue({ email: 'admin@kumaran.world' }),
      setBlocked: jasmine.createSpy('setBlocked')
    };

    await TestBed.configureTestingModule({
      imports: [TokenUsageMonitoringComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ChatService, useValue: mockChatService },
        { provide: ToastService, useValue: mockToastService },
        { provide: TokenService, useValue: mockTokenService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TokenUsageMonitoringComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load token usage on init', () => {
    expect(component).toBeTruthy();
    expect(mockChatService.getUserTokensDetails).toHaveBeenCalledWith(1, undefined, 10);
    expect(component.tokenUsage.length).toBe(1);
    expect(component.tokenUsageTotalPages).toBe(5);
  });

  it('should handle pagination', () => {
    component.goToTokenUsagePage(2);
    expect(mockChatService.getUserTokensDetails).toHaveBeenCalledWith(2, undefined, 10);

    const mockEvent = new Event('submit');
    component.tokenUsagePageInput = 2;
    component.onTokenUsagePageInputSubmit(mockEvent);
    expect(component.tokenUsagePage).toBe(2);
  });

  it('should toggle sort column and load sorted token usage', () => {
    component.toggleTokenUsageSort('tokens_used');
    expect(component.tokenUsageSortColumn).toBe('tokens_used');
    expect(component.tokenUsageSortDir).toBe('desc');
    expect(mockChatService.getSortedTokenUsageUsers).toHaveBeenCalled();

    // Toggle same column flips direction to asc
    component.toggleTokenUsageSort('tokens_used');
    expect(component.tokenUsageSortDir).toBe('asc');
  });

  it('should handle search input', fakeAsync(() => {
    component.onTokenUsageSearchChange('user1');
    tick(1000);
    expect(mockChatService.searchTokenUsageUsers).toHaveBeenCalledWith('user1');

    component.clearTokenUsageSearch();
    expect(component.tokenUsageSearchQuery).toBe('');
  }));

  it('should enable and disable user', () => {
    component.enableUser('user1');
    expect(mockChatService.unblockUser).toHaveBeenCalledWith('user1');

    component.disableUser('user1');
    expect(mockChatService.blockUser).toHaveBeenCalledWith('user1');
  });

  it('should toggle sensitive questions action', () => {
    const event = new MouseEvent('click');
    component.onSensitiveQuestionsAction('user1', event, false);
    expect(mockChatService.setSensitiveQuestionsAllowance).toHaveBeenCalledWith('user1', false);
  });

  it('should open and close action menu', () => {
    const event = new MouseEvent('click');
    component.toggleTokenUsageActionsMenu(event, 'user1');
    expect(component.tokenUsageActionsMenuUserId).toBe('user1');

    component.closeTokenUsageActionsMenu();
    expect(component.tokenUsageActionsMenuUserId).toBeNull();
  });
});
