import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BugReportsComponent, BugReport, BugAttachment } from '@features/admin-dashboard/pages/bug-reports/bug-reports.component';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ToastService } from '@core/services/toast.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { TokenService } from '@core/services/token.service';
import { Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('BugReportsComponent', () => {
  let component: BugReportsComponent;
  let fixture: ComponentFixture<BugReportsComponent>;

  let mockChatService: any;
  let mockToastService: any;
  let mockRouter: any;
  let mockAzureAdService: any;

  const mockAttachment: BugAttachment = {
    id: 1,
    file_name: 'test.png',
    file_type: 'image/png',
    file_size: 1024,
    file_data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  const mockBugReports: BugReport[] = [
    {
      id: 1,
      ticket_number: 'TKT-001',
      bug_name: 'Bug 1',
      description: 'Desc 1',
      attachments: [mockAttachment],
      created_by: 'user@test.com',
      created_at: '2026-05-26T06:00:00Z',
      updated_at: '2026-05-26T06:00:00Z',
      status: 'open'
    },
    {
      id: 2,
      ticket_number: 'TKT-002',
      bug_name: 'Bug 2',
      description: 'Desc 2',
      attachments: [],
      created_by: 'user@test.com',
      created_at: '2026-05-26T06:10:00Z',
      updated_at: '2026-05-26T06:10:00Z',
      status: 'closed'
    }
  ];

  beforeEach(async () => {
    // Clear session storage before each test
    sessionStorage.clear();

    mockChatService = {
      getBugReports: jasmine.createSpy('getBugReports').and.callFake((payload: any) => of({
        data: mockBugReports,
        total_bug_count: 2,
        filtered_bug_count: payload.filter ? 1 : 2,
        closed_bug_count: 1,
        open_bug_count: 1,
        investigation_bug_count: 0,
        page: payload.page || 1,
        limit: payload.limit || 10
      })),
      updateBugStatus: jasmine.createSpy('updateBugStatus').and.returnValue(of({ success: true })),
      getBugAttachment: jasmine.createSpy('getBugAttachment').and.returnValue(of({
        id: 1,
        file_name: 'test.png',
        file_type: 'image/png',
        file_size: 1024,
        file_data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      }))
    };

    mockToastService = {
      show: jasmine.createSpy('show')
    };

    mockRouter = {
      navigate: jasmine.createSpy('navigate')
    };

    mockAzureAdService = {
      logout: jasmine.createSpy('logout')
    };

    await TestBed.configureTestingModule({
      imports: [BugReportsComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ChatService, useValue: mockChatService },
        { provide: ToastService, useValue: mockToastService },
        { provide: Router, useValue: mockRouter },
        { provide: AzureAdService, useValue: mockAzureAdService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BugReportsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should load user info from sessionStorage', () => {
    const tokenService = TestBed.inject(TokenService);
    const userInfo = { name: 'John Doe', email: 'john.doe@test.com' };
    tokenService.setUserInfo(userInfo);
    component.loadUserInfo();
    fixture.detectChanges();

    expect(component.userFullName).toBe('John Doe');
    expect(component.userEmail).toBe('john.doe@test.com');
    expect(component.userInitials).toBe('JD');
  });

  it('should generate correct initials', () => {
    expect(component.getInitials('John Doe')).toBe('JD');
    expect(component.getInitials('Single')).toBe('S');
    expect(component.getInitials('')).toBe('?');
  });

  it('should toggle user menu open status', () => {
    expect(component.userMenuOpen).toBeFalse();
    component.toggleUserMenu();
    expect(component.userMenuOpen).toBeTrue();
    component.toggleUserMenu();
    expect(component.userMenuOpen).toBeFalse();
  });

  it('should clear sessionStorage and logout via AzureAd on logout()', () => {
    sessionStorage.setItem('userInfo', 'something');
    component.logout();
    expect(sessionStorage.getItem('userInfo')).toBeNull();
    expect(mockAzureAdService.logout).toHaveBeenCalled();
  });

  it('should load bug reports and statistics on init', () => {
    fixture.detectChanges();
    expect(mockChatService.getBugReports).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      page: 1,
      limit: 10
    });
    expect(component.bugReports.length).toBe(2);
    expect(component.totalReports).toBe(2);
    expect(component.openCount).toBe(1);
    expect(component.closedCount).toBe(1);
    expect(component.investigationCount).toBe(0);
  });

  it('should handle error when loading bug reports', () => {
    mockChatService.getBugReports.and.returnValue(throwError(() => new Error('Error')));
    fixture.detectChanges();
    expect(component.errorMsg).toBe('Failed to load bug reports');
    expect(mockToastService.show).toHaveBeenCalledWith('Failed to fetch bug reports', 'error');
  });

  it('should update bug status and adjust stats correctly', () => {
    fixture.detectChanges();
    const bug = { ...mockBugReports[0] };
    component.changeStatus(bug, 'closed');

    expect(mockChatService.updateBugStatus).toHaveBeenCalledWith({
      ticket_number: 'TKT-001',
      state: 'closed'
    });
    expect(bug.status).toBe('closed');
    expect(component.openCount).toBe(0);
    expect(component.closedCount).toBe(2);
    expect(mockToastService.show).toHaveBeenCalledWith('Ticket TKT-001 status updated to closed', 'success');
  });

  it('should not update bug status if new status is same as current status', () => {
    fixture.detectChanges();
    mockChatService.updateBugStatus.calls.reset();
    const bug = mockBugReports[0]; // status is 'open'
    component.changeStatus(bug, 'open');

    expect(mockChatService.updateBugStatus).not.toHaveBeenCalled();
  });

  it('should show error toast if status update fails', () => {
    fixture.detectChanges();
    mockChatService.updateBugStatus.and.returnValue(throwError(() => new Error('Update failed')));
    const bug = { ...mockBugReports[0] };
    component.changeStatus(bug, 'Investigation');

    expect(mockToastService.show).toHaveBeenCalledWith('Failed to update status for TKT-001', 'error');
  });

  it('should fetch attachment and open preview when file_data is absent', () => {
    fixture.detectChanges();
    const attachmentWithoutData: BugAttachment = {
      id: 20,
      file_name: 'kai_image.png',
      file_type: 'image/png',
      file_size: 1772016,
    };

    component.openPreview(attachmentWithoutData);

    expect(mockChatService.getBugAttachment).toHaveBeenCalledWith({ attachment_id: 20 });
    expect(attachmentWithoutData.file_data).toBeDefined();
    expect(component.previewAttachment).toBe(attachmentWithoutData);
    expect(component.previewFileUrl).toBeTruthy();
  });

  it('should use cached file_data without calling API when opening preview', () => {
    fixture.detectChanges();
    mockChatService.getBugAttachment.calls.reset();

    component.openPreview(mockAttachment);

    expect(mockChatService.getBugAttachment).not.toHaveBeenCalled();
    expect(component.previewAttachment).toBe(mockAttachment);
    expect(component.previewFileUrl).toBeTruthy();
  });

  it('should show error toast if fetching attachment for preview fails', () => {
    fixture.detectChanges();
    mockChatService.getBugAttachment.and.returnValue(throwError(() => new Error('Fetch failed')));
    const attachmentWithoutData: BugAttachment = {
      id: 99,
      file_name: 'error.png',
      file_type: 'image/png',
      file_size: 1024,
    };

    component.openPreview(attachmentWithoutData);

    expect(mockToastService.show).toHaveBeenCalledWith('Failed to load file attachment', 'error');
    expect(component.fetchingAttachment[99]).toBeFalse();
  });

  it('should fetch attachment and download when file_data is absent', () => {
    fixture.detectChanges();
    const spyCreate = spyOn(window.URL, 'createObjectURL').and.returnValue('blob:mock-url');
    const spyRevoke = spyOn(window.URL, 'revokeObjectURL');
    const mockAnchor = document.createElement('a');
    spyOn(document, 'createElement').and.returnValue(mockAnchor);
    spyOn(mockAnchor, 'click');

    const attachmentWithoutData: BugAttachment = {
      id: 21,
      file_name: 'download-test.png',
      file_type: 'image/png',
      file_size: 1024,
    };

    component.downloadAttachment(attachmentWithoutData);

    expect(mockChatService.getBugAttachment).toHaveBeenCalledWith({ attachment_id: 21 });
    expect(spyCreate).toHaveBeenCalled();
    expect(mockAnchor.download).toBe('test.png');
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(spyRevoke).toHaveBeenCalledWith('blob:mock-url');
    expect(mockToastService.show).toHaveBeenCalledWith('Attachment downloaded successfully', 'success');
  });

  it('should decode and download attachment immediately if file_data is already present', () => {
    fixture.detectChanges();
    mockChatService.getBugAttachment.calls.reset();

    const spyCreate = spyOn(window.URL, 'createObjectURL').and.returnValue('blob:mock-url');
    const spyRevoke = spyOn(window.URL, 'revokeObjectURL');
    const mockAnchor = document.createElement('a');
    spyOn(document, 'createElement').and.returnValue(mockAnchor);
    spyOn(mockAnchor, 'click');

    component.downloadAttachment(mockAttachment);

    expect(mockChatService.getBugAttachment).not.toHaveBeenCalled();
    expect(spyCreate).toHaveBeenCalled();
    expect(mockAnchor.download).toBe('test.png');
    expect(mockAnchor.href).toContain('blob:mock-url');
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(spyRevoke).toHaveBeenCalledWith('blob:mock-url');
    expect(mockToastService.show).toHaveBeenCalledWith('Attachment downloaded successfully', 'success');
  });

  it('should show error toast if no file attachment is passed to downloadAttachment', () => {
    fixture.detectChanges();
    component.downloadAttachment(null as any);
    expect(mockToastService.show).toHaveBeenCalledWith('No file attachment found', 'error');
  });

  it('should open attachment picker modal if bug has multiple attachments', () => {
    fixture.detectChanges();
    const bugWithMultiple: BugReport = {
      id: 10,
      ticket_number: 'TKT-MULTI',
      bug_name: 'Multi attachment bug',
      description: 'Desc',
      attachments: [
        { id: 1, file_name: 'f1.png', file_type: 'image/png', file_size: 100 },
        { id: 2, file_name: 'f2.png', file_type: 'image/png', file_size: 200 }
      ],
      created_by: 'user@test.com',
      created_at: '2026-05-26T06:00:00Z',
      updated_at: null,
      status: 'open'
    };

    component.openAttachments(bugWithMultiple);
    expect(component.attachmentPickerBug).toBe(bugWithMultiple);
  });

  it('should auto-apply search filter after debounce', fakeAsync(() => {
    fixture.detectChanges();
    mockChatService.getBugReports.calls.reset();

    component.onSearchChange('file upload');
    tick(400);

    expect(mockChatService.getBugReports).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      page: 1,
      limit: 10,
      filter: {
        search: 'file upload',
      },
    });
  }));

  it('should auto-apply status filter on change', () => {
    fixture.detectChanges();
    mockChatService.getBugReports.calls.reset();

    component.statusFilter = 'Investigation';
    component.onStatusFilterChange();

    expect(mockChatService.getBugReports).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      page: 1,
      limit: 10,
      filter: {
        status: 'Investigation',
      },
    });
  });

  it('should handle page navigation correctly in goToPage()', () => {
    fixture.detectChanges();
    mockChatService.getBugReports.calls.reset();

    component.totalPages = 5;
    component.goToPage(3);

    expect(component.page).toBe(3);
    expect(mockChatService.getBugReports).toHaveBeenCalled();
  });

  it('should not navigate to invalid page', () => {
    fixture.detectChanges();
    mockChatService.getBugReports.calls.reset();

    component.totalPages = 5;
    component.page = 2;
    component.goToPage(10); // Out of range

    expect(component.page).toBe(2);
    expect(mockChatService.getBugReports).not.toHaveBeenCalled();
  });

  it('should handle page input submission', () => {
    fixture.detectChanges();
    spyOn(component, 'goToPage');

    component.totalPages = 5;
    component.pageInput = 4;
    component.onPageInputSubmit({});

    expect(component.goToPage).toHaveBeenCalledWith(4);
  });

  it('should show error for invalid page input submission', () => {
    fixture.detectChanges();
    spyOn(component, 'goToPage');

    component.totalPages = 5;
    component.pageInput = 10;
    component.onPageInputSubmit({});

    expect(component.goToPage).not.toHaveBeenCalled();
    expect(mockToastService.show).toHaveBeenCalledWith('Please enter a page between 1 and 5', 'error');
  });

  it('should format date correctly', () => {
    fixture.detectChanges();
    const formatted = component.formatDate('2026-05-26T06:00:00Z');
    expect(formatted).not.toBe('-');
    expect(component.formatDate('')).toBe('-');
  });

  it('should format bytes correctly', () => {
    fixture.detectChanges();
    expect(component.formatBytes(0)).toBe('0 Bytes');
    expect(component.formatBytes(512)).toBe('512 Bytes');
    expect(component.formatBytes(2048)).toBe('2 KB');
    expect(component.formatBytes(1572864)).toBe('1.5 MB');
    expect(component.formatBytes(null)).toBe('-');
  });
});
