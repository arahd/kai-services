import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Component, Directive, Input, Output, EventEmitter, Pipe, PipeTransform, NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, NavigationEnd } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';

import { SidenavComponent } from './sidenav.component';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ChatHistoryStateService } from '@features/chatbot/services/chat-history-state.service';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';
import { ThemeService, THEME_PALETTES, FONT_FAMILIES } from '@core/services/theme.service';
import { ConfigService } from '@core/services/config.service';
import { SidenavCacheService } from '@features/sidenav/sidenav-cache.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { HrPermissionService } from '@features/hr-portal/hr-portal-services/hr-permission.service';
import { AgentService } from '@features/agents/services/agent.service';
import { ProjectStateService } from '@features/projects/services/project-state.service';

// ── Stub Child Components ──────────────────────────────────────────────

@Component({ selector: 'app-sidenav-profile', standalone: true, template: '' })
class SidenavProfileStubComponent {
  @Input() userInfo: any;
  @Input() userInitial = '';
  @Input() collapsed = false;
  @Input() popoverOpen = false;
  @Input() popoverPosition: any;
  @Input() streaming = true;
  @Input() models: any[] = [];
  @Output() togglePopoverEvt = new EventEmitter<MouseEvent>();
  @Output() logoutEvt = new EventEmitter<void>();
  @Output() streamingToggleEvt = new EventEmitter<boolean>();
  @Output() openSettingsEvt = new EventEmitter<void>();
}

@Component({ selector: 'app-chat-context-menu', standalone: true, template: '' })
class ChatContextMenuStubComponent {
  @Input() chat: any;
  @Input() index = 0;
  @Input() isActionDisabled = false;
  @Input() disabledTooltip = '';
  @Input() menuPosition: any;
  @Input() isPinned = false;
  @Input() showShare = true;
  @Input() showPin = true;
  @Input() showRename = true;
  @Input() showMoveToProject = false;
  @Input() showDelete = true;
  @Output() rename = new EventEmitter<number>();
  @Output() renameEvt = new EventEmitter<void>();
  @Output() deleteChat = new EventEmitter<number>();
  @Output() deleteEvt = new EventEmitter<MouseEvent>();
  @Output() pinChat = new EventEmitter<number>();
  @Output() pinEvt = new EventEmitter<void>();
  @Output() shareChat = new EventEmitter<number>();
  @Output() shareEvt = new EventEmitter<void>();
  @Output() moveToProjectEvt = new EventEmitter<void>();
}

@Component({ selector: 'app-move-to-project-modal', standalone: true, template: '' })
class MoveToProjectModalStubComponent {
  @Input({ required: true }) conversationId!: string;
  @Input() conversationTitle: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() moved = new EventEmitter<number>();
  @Output() createProjectRequested = new EventEmitter<void>();
}

@Component({ selector: 'app-sidenav-icon', standalone: true, template: '' })
class SidenavIconStubComponent {
  @Input() name = '';
  @Input() width: any;
  @Input() height: any;
}


// ── Stub Directives ────────────────────────────────────────────────────

@Directive({ selector: '[appTooltip]', standalone: true })
class TooltipStubDirective {
  @Input('appTooltip') tooltipText = '';
}

// ── Stub Pipes ─────────────────────────────────────────────────────────

@Pipe({ name: 'isRouteActive', standalone: true, pure: true })
class IsRouteActiveStubPipe implements PipeTransform {
  transform(path: string, currentUrl: string): boolean {
    return (currentUrl || '').startsWith(path);
  }
}

// ── Test Suite ─────────────────────────────────────────────────────────

describe('SidenavComponent', () => {
  let component: SidenavComponent;
  let fixture: ComponentFixture<SidenavComponent>;

  // Service mocks
  let historyServiceMock: any;
  let azureAdMock: any;
  let chatServiceMock: any;
  let toastServiceMock: any;
  let tokenServiceMock: any;
  let themeServiceMock: any;
  let configServiceMock: any;
  let cacheMock: any;
  let layoutBridgeMock: any;
  let routerMock: any;
  let routerEvents$: Subject<any>;

  beforeEach(async () => {
    sessionStorage.clear();
    routerEvents$ = new Subject<any>();

    // ChatHistoryStateService mock — provides all the signal-based state
    historyServiceMock = {
      chats: signal<any[]>([]),
      activeConversationID: signal<string | null>(null),
      activeTempId: signal<string | null>(null),
      generatingStates: signal<{ [key: string]: boolean }>({}),
      conversationStatuses: signal<any>({}),
      currentPage: signal<number>(1),
      totalPages: signal<number>(0),
      loadingChats: signal<boolean>(false),
      searchText: signal<string>(''),
      searchResults: signal<any[]>([]),
      isSearchLoading: signal<boolean>(false),
      streaming: signal<boolean>(false),
      showHistorySection: signal<boolean>(true),
      pinChat: jasmine.createSpy('pinChat'),
      sortChats: jasmine.createSpy('sortChats'),
      deleteChat: jasmine.createSpy('deleteChat'),
      renameChat: jasmine.createSpy('renameChat'),
      searchChat: jasmine.createSpy('searchChat'),
      loadSidebarPageByConversationID: jasmine.createSpy('loadSidebarPageByConversationID'),
      loadConversationByConversationID: jasmine.createSpy('loadConversationByConversationID'),
      loadConversationMessages: jasmine.createSpy('loadConversationMessages').and.callFake((email: string, id: string, onLoaded: (c: any) => void) => {
        const found = historyServiceMock.chats().find((c: any) => c.conversationID === id);
        if (onLoaded) onLoaded(found || { conversationID: id });
      }),
      loadHistoryPagesUpTo: jasmine.createSpy('loadHistoryPagesUpTo'),
      loadChats: jasmine.createSpy('loadChats'),
      resetChatsAndLoad: jasmine.createSpy('resetChatsAndLoad'),
      syncCache: jasmine.createSpy('syncCache'),
    };

    azureAdMock = {
      getUserInfoObservable: jasmine.createSpy('getUserInfoObservable').and.returnValue(of({ name: 'Test User', email: 'test@test.com' })),
      logout: jasmine.createSpy('logout'),
    };

    chatServiceMock = {
      refreshChatHistory$: new Subject<void>(),
      firstQuestion$: new Subject<string>(),
      draftConv$: new Subject<any>(),
      activeTempId$: new Subject<string | null>(),
      getConversationHistory: jasmine.createSpy('getConversationHistory').and.returnValue(of([])),
      getChatInformation: jasmine.createSpy('getChatInformation').and.returnValue(of({})),
      deleteChat: jasmine.createSpy('deleteChat').and.returnValue(of({})),
      pinChat: jasmine.createSpy('pinChat').and.returnValue(of({})),
      shareChat: jasmine.createSpy('shareChat').and.returnValue(of({ url: 'http://share.link/abc123' })),
      searchChat: jasmine.createSpy('searchChat').and.returnValue(of([])),
      setActiveTempId: jasmine.createSpy('setActiveTempId'),
    };

    toastServiceMock = {
      show: jasmine.createSpy('show'),
    };

    tokenServiceMock = {
      isAdmin: jasmine.createSpy('isAdmin').and.returnValue(false),
      isHrAdmin: jasmine.createSpy('isHrAdmin').and.returnValue(false),
      isBlocked: jasmine.createSpy('isBlocked').and.returnValue(false),
      hasAgentAccess: jasmine.createSpy('hasAgentAccess').and.returnValue(true),
      getUserInfo: jasmine.createSpy('getUserInfo').and.returnValue({ name: 'Test User', email: 'test@test.com' }),
    };

    themeServiceMock = {
      themeSignal: signal('system'),
      colorThemeSignal: signal('default'),
      fontFamilySignal: signal('inter'),
      setTheme: jasmine.createSpy('setTheme'),
      setColorTheme: jasmine.createSpy('setColorTheme'),
      setFontFamily: jasmine.createSpy('setFontFamily'),
      isThemeSupportedUrl: jasmine.createSpy('isThemeSupportedUrl').and.returnValue(true),
    };

    configServiceMock = {
      getConfig: jasmine.createSpy('getConfig').and.returnValue({
        chatbotUrl: 'http://dev.test.com',
        azureUrl: '', hrportalUrl: '', kafUrl: '', kplatformUrl: '',
        azureAd: { clientId: '', tenantId: '', redirectUri: '', scopes: '' },
      }),
      loadConfig: jasmine.createSpy('loadConfig').and.returnValue(Promise.resolve()),
    };

    cacheMock = {
      get: jasmine.createSpy('get').and.returnValue(null),
      set: jasmine.createSpy('set'),
      clear: jasmine.createSpy('clear'),
    };

    layoutBridgeMock = {
      registerHost: jasmine.createSpy('registerHost'),
      unregisterHost: jasmine.createSpy('unregisterHost'),
      setUserInfo: jasmine.createSpy('setUserInfo'),
      sidenavCollapsed: signal<boolean>(false),
      models: signal<any[]>([]),
      userInfo: signal<any>(null),
      activeHost: signal<any>(null),
    };

    routerMock = {
      url: '/chatbot',
      navigate: jasmine.createSpy('navigate'),
      events: routerEvents$.asObservable(),
    };

    await TestBed.configureTestingModule({
      imports: [SidenavComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ChatHistoryStateService, useValue: historyServiceMock },
        { provide: AzureAdService, useValue: azureAdMock },
        { provide: ChatService, useValue: chatServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: ThemeService, useValue: themeServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: SidenavCacheService, useValue: cacheMock },
        { provide: SidenavLayoutBridgeService, useValue: layoutBridgeMock },
        {
          provide: HrPermissionService,
          useValue: {
            loadAccessControl: () => of({ is_admin: false, resume_internal: true, visa_business: false }),
            isAdmin: () => false,
            hasAnyResumeAccess: () => true,
            hasAnyVisaAccess: () => false,
          },
        },
        {
          provide: AgentService,
          useValue: {
            getAgents: jasmine.createSpy('getAgents').and.returnValue(of(null)),
            isLoaded: signal(false),
            totalCount: () => 0,
            privateAgents: () => [],
            groupAgents: () => [],
            publicAgents: () => [],
            selectedAgent: signal(null),
          },
        },
        {
          provide: ProjectStateService,
          useValue: {
            projects: signal<any[]>([]),
            filteredProjects: signal<any[]>([]),
            isLoading: signal<boolean>(false),
            showCreateModal: signal<boolean>(false),
            activeProject: signal<any>(null),
            loadProjects: jasmine.createSpy('loadProjects'),
            togglePin: jasmine.createSpy('togglePin'),
            deleteProject: jasmine.createSpy('deleteProject').and.returnValue(Promise.resolve(true)),
            updateProject: jasmine.createSpy('updateProject').and.returnValue(Promise.resolve({})),
          },
        },
        { provide: Router, useValue: routerMock },
      ],
    })
      .overrideComponent(SidenavComponent, {
        set: {
          imports: [
            FormsModule,
            SidenavProfileStubComponent,
            ChatContextMenuStubComponent,
            SidenavIconStubComponent,
            TooltipStubDirective,
            IsRouteActiveStubPipe,
            MoveToProjectModalStubComponent,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SidenavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  // ── 1. Creation & Initial State ───────────────────────────────────────

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should have collapsed as false initially', () => {
    expect(component.collapsed).toBeFalse();
  });

  it('should have showConfirm as false initially', () => {
    expect(component.showConfirm).toBeFalse();
  });

  it('should have showRenameModal as false initially', () => {
    expect(component.showRenameModal).toBeFalse();
  });

  it('should have showSearchModal as false initially', () => {
    expect(component.showSearchModal).toBeFalse();
  });

  it('should have showShareModal as false initially', () => {
    expect(component.showShareModal).toBeFalse();
  });

  // ── 2. Lifecycle (ngOnInit) ───────────────────────────────────────────

  it('should set userInfo from TokenService on init', () => {
    expect(component.userInfo).toEqual({ name: 'Test User', email: 'test@test.com' });
  });

  it('should set userInitial from user name on init', () => {
    expect(component.userInitial).toBe('TU');
  });

  it('should set isAdmin and isHrAdmin from TokenService', () => {
    expect(component.isAdmin).toBeFalse();
    expect(component.isHrAdmin).toBeFalse();
  });

  it('should set isHrAdminAccess based on access_control is_admin response', () => {
    expect(component.isHrAdminAccess()).toBeFalse();
  });

  it('should not display HR Analytics in menu when isHrAdminAccess is false', () => {
    const hrPerm = TestBed.inject(HrPermissionService);
    spyOn(hrPerm, 'loadAccessControl').and.returnValue(of({ is_admin: false, resume_internal: true, visa_business: false } as any));
    tokenServiceMock.isHrAdmin.and.returnValue(true);
    routerMock.url = '/hrportal';

    const localFixture = TestBed.createComponent(SidenavComponent);
    localFixture.detectChanges();

    const analyticsEl = localFixture.nativeElement.querySelector('[title="HR Analytics"]');
    expect(analyticsEl).toBeNull();
  });

  it('should display HR Analytics in menu when isHrAdminAccess is true', () => {
    const hrPerm = TestBed.inject(HrPermissionService);
    spyOn(hrPerm, 'loadAccessControl').and.returnValue(of({ is_admin: true, resume_internal: true, visa_business: false } as any));
    tokenServiceMock.isHrAdmin.and.returnValue(true);
    routerMock.url = '/hrportal';

    const localFixture = TestBed.createComponent(SidenavComponent);
    localFixture.detectChanges();

    const analyticsEl = localFixture.nativeElement.querySelector('[title="HR Analytics"]');
    expect(analyticsEl).not.toBeNull();
  });

  // ── 3. User Initials ─────────────────────────────────────────────────

  it('should generate two-letter initials from full name', () => {
    expect(component.getInitials('Maxim Baskar')).toBe('MB');
  });

  it('should generate single-letter initial from single name', () => {
    expect(component.getInitials('Maxim')).toBe('M');
  });

  it('should return empty string for empty name', () => {
    expect(component.getInitials('')).toBe('');
  });

  // ── 4. Display Title ─────────────────────────────────────────────────

  it('should prioritize conversationName for display title', () => {
    const chat = { conversationName: 'My Chat', conversation: [{ question: 'Q1' }] };
    expect(component.getDisplayTitle(chat)).toBe('My Chat');
  });

  it('should fall back to first question when no conversationName', () => {
    const chat = { conversation: [{ question: 'Short question' }] };
    expect(component.getDisplayTitle(chat)).toBe('Short question');
  });

  it('should truncate long first questions to 30 chars', () => {
    const longQ = 'A'.repeat(50);
    const chat = { conversation: [{ question: longQ }] };
    expect(component.getDisplayTitle(chat)).toBe('A'.repeat(30) + '...');
  });

  it('should return "New Chat" when no name or conversation', () => {
    expect(component.getDisplayTitle({})).toBe('New Chat');
    expect(component.getDisplayTitle({ conversation: [] })).toBe('New Chat');
  });

  // ── 5. Tooltip Text ──────────────────────────────────────────────────

  it('should return tooltip text truncated at 60 chars', () => {
    const longName = 'B'.repeat(80);
    const chat = { conversationName: longName };
    expect(component.getTooltipText(chat)).toBe('B'.repeat(60) + '...');
  });

  it('should return full text when under 60 chars', () => {
    const chat = { conversationName: 'Short name' };
    expect(component.getTooltipText(chat)).toBe('Short name');
  });

  // ── 6. Collapse Toggle ───────────────────────────────────────────────

  it('should toggle collapsed state', () => {
    expect(component.collapsed).toBeFalse();
    component.toggleCollapse();
    expect(component.collapsed).toBeTrue();
    component.toggleCollapse();
    expect(component.collapsed).toBeFalse();
  });

  it('should emit collapsedChange on toggle', () => {
    spyOn(component.collapsedChange, 'emit');
    component.toggleCollapse();
    expect(component.collapsedChange.emit).toHaveBeenCalledWith(true);
  });

  // ── 7. New Chat ───────────────────────────────────────────────────────

  it('should navigate to chatbot on newChat', () => {
    component.newChat();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/chatbot']);
  });

  it('should emit newChatClicked on newChat', () => {
    spyOn(component.newChatClicked, 'emit');
    component.newChat();
    expect(component.newChatClicked.emit).toHaveBeenCalled();
  });

  it('should emit closeMobileSidebar on newChat', () => {
    spyOn(component.closeMobileSidebar, 'emit');
    component.newChat();
    expect(component.closeMobileSidebar.emit).toHaveBeenCalled();
  });

  it('should reset active IDs on newChat', () => {
    historyServiceMock.activeConversationID.set('old-id');
    historyServiceMock.activeTempId.set('old-temp');

    component.newChat();

    expect(component.activeConversationID).toBeNull();
    expect(component.activeTempId).toBeNull();
  });

  it('should close search modal before starting new chat if open', () => {
    component.showSearchModal = true;
    component.newChat();
    expect(component.showSearchModal).toBeFalse();
  });

  // ── 8. Admin/HR Menu Toggles ──────────────────────────────────────────

  it('should toggle adminMenuExpanded', () => {
    expect(component.adminMenuExpanded).toBeFalse();
    component.toggleAdminMenu();
    expect(component.adminMenuExpanded).toBeTrue();
    component.toggleAdminMenu();
    expect(component.adminMenuExpanded).toBeFalse();
  });

  it('should toggle hrMenuExpanded', () => {
    expect(component.hrMenuExpanded).toBeFalse();
    component.toggleHrMenu();
    expect(component.hrMenuExpanded).toBeTrue();
    component.toggleHrMenu();
    expect(component.hrMenuExpanded).toBeFalse();
  });

  it('should stop propagation on admin menu toggle with event', () => {
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');
    spyOn(event, 'preventDefault');

    component.toggleAdminMenu(event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  // ── 9. Navigation ────────────────────────────────────────────────────

  it('should expand admin menu when navigating to /admin', () => {
    component.safeNavigate('/admin');
    expect(component.adminMenuExpanded).toBeTrue();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/admin']);
  });

  it('should expand hr menu when navigating to /hrportal', () => {
    component.safeNavigate('/hrportal');
    expect(component.hrMenuExpanded).toBeTrue();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/hrportal']);
  });

  it('should expand hr menu and navigate to /hrportal/analytics', () => {
    component.safeNavigate('/hrportal/analytics');
    expect(component.hrMenuExpanded).toBeTrue();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/hrportal/analytics']);
  });

  it('should expand hr menu and navigate to /hrportal/recent-activity', () => {
    component.safeNavigate('/hrportal/recent-activity');
    expect(component.hrMenuExpanded).toBeTrue();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/hrportal/recent-activity']);
  });

  it('should expand hr menu and navigate to /hrportal/history', () => {
    component.safeNavigate('/hrportal/history');
    expect(component.hrMenuExpanded).toBeTrue();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/hrportal/history']);
  });

  it('should navigate to admin section via openAdminSection', () => {
    component.openAdminSection();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/admin']);
  });

  it('should navigate to HR section via openHrSection', () => {
    component.openHrSection();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/hrportal']);
  });

  // ── 10. Route Detection ──────────────────────────────────────────────

  it('should detect chatbot route as active', () => {
    expect(component.isChatbotActive()).toBeTrue();
  });

  it('should detect non-chatbot route', () => {
    routerMock.url = '/admin';
    expect(component.isChatbotActive()).toBeFalse();
  });

  it('should detect admin route as active', () => {
    routerMock.url = '/admin/dashboard';
    expect(component.isRouteActive('/admin')).toBeTrue();
  });

  it('should return false for non-matching route', () => {
    routerMock.url = '/chatbot';
    expect(component.isRouteActive('/admin')).toBeFalse();
  });

  // ── 11. Delete Flow ──────────────────────────────────────────────────

  it('should set delete index and show confirm on confirmDelete', () => {
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');

    component.confirmDelete(3, event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(component.chatToDeleteIndex).toBe(3);
    expect(component.showConfirm).toBeTrue();
  });

  it('should delegate deleteChat to historyService and reset state', () => {
    component.chatToDeleteIndex = 2;
    component.showConfirm = true;

    component.deleteChat();

    expect(historyServiceMock.deleteChat).toHaveBeenCalled();
    expect(component.chatToDeleteIndex).toBeNull();
    expect(component.showConfirm).toBeFalse();
  });

  it('should not delete when chatToDeleteIndex is null', () => {
    component.chatToDeleteIndex = null;
    component.deleteChat();
    expect(historyServiceMock.deleteChat).not.toHaveBeenCalled();
  });

  it('should reset state on cancelDelete', () => {
    component.chatToDeleteIndex = 5;
    component.showConfirm = true;

    component.cancelDelete();

    expect(component.showConfirm).toBeFalse();
    expect(component.chatToDeleteIndex).toBeNull();
  });

  // ── 12. Rename Flow ──────────────────────────────────────────────────

  it('should open rename modal with pre-filled value', () => {
    historyServiceMock.chats.set([
      { conversationName: 'My Chat', conversation: [{ question: 'Q1' }] },
    ]);

    component.openRenameModal(0);

    expect(component.chatToRenameIndex).toBe(0);
    expect(component.renameValue).toBe('My Chat');
    expect(component.showRenameModal).toBeTrue();
    expect(component.activeOptionsIndex).toBeNull();
  });

  it('should fall back to first question for rename value', () => {
    historyServiceMock.chats.set([
      { conversation: [{ question: 'First Q' }] },
    ]);

    component.openRenameModal(0);
    expect(component.renameValue).toBe('First Q');
  });

  it('should delegate confirmRename to historyService', () => {
    component.chatToRenameIndex = 0;
    component.renameValue = 'New Name';

    component.confirmRename();

    expect(historyServiceMock.renameChat).toHaveBeenCalledWith(0, 'New Name', 'test@test.com');
    expect(component.showRenameModal).toBeFalse();
    expect(component.chatToRenameIndex).toBeNull();
    expect(component.renameValue).toBe('');
  });

  it('should not rename with empty value', () => {
    component.chatToRenameIndex = 0;
    component.renameValue = '   ';

    component.confirmRename();
    expect(historyServiceMock.renameChat).not.toHaveBeenCalled();
  });

  it('should reset state on cancelRename', () => {
    component.showRenameModal = true;
    component.chatToRenameIndex = 3;
    component.renameValue = 'test';

    component.cancelRename();

    expect(component.showRenameModal).toBeFalse();
    expect(component.chatToRenameIndex).toBeNull();
    expect(component.renameValue).toBe('');
  });

  // ── 13. Share Flow ───────────────────────────────────────────────────

  it('should show error toast when sharing unsaved conversation', () => {
    historyServiceMock.chats.set([{ conversation: [{ question: 'Q1' }] }]);
    component.activeOptionsIndex = 0;

    component.shareChat(0);

    expect(toastServiceMock.show).toHaveBeenCalledWith('Cannot share unsaved conversation', 'error');
    expect(component.showShareModal).toBeFalse();
  });

  it('should close share modal and reset state', () => {
    component.showShareModal = true;
    component.shareUrl = 'http://test.com';
    component.shareTitle = 'Title';
    component.shareConversationPairs = [{ question: 'Q', answer: 'A' }];
    component.shareLinkCopied = true;

    component.closeShareModal();

    expect(component.showShareModal).toBeFalse();
    expect(component.shareUrl).toBe('');
    expect(component.shareTitle).toBe('');
    expect(component.shareConversationPairs).toEqual([]);
    expect(component.shareLinkCopied).toBeFalse();
  });

  // ── 13b. Move to Project Flow ──────────────────────────────────────────

  it('should show error toast when moving unsaved conversation', () => {
    historyServiceMock.chats.set([{ conversation: [{ question: 'Q1' }] }]);
    component.openMoveToProjectModal(0);

    expect(toastServiceMock.show).toHaveBeenCalledWith('Cannot move unsaved conversation', 'error');
    expect(component.showMoveToProjectModal()).toBeFalse();
  });

  it('should open move to project modal when conversation has conversationID', () => {
    const chat = { conversationID: 'conv-123', conversationName: 'My Project Chat' };
    historyServiceMock.chats.set([chat]);

    component.openMoveToProjectModal(0);

    expect(component.showMoveToProjectModal()).toBeTrue();
    expect(component.chatToMove()).toEqual(chat);
  });

  it('should close move to project modal and reset chatToMove', () => {
    component.showMoveToProjectModal.set(true);
    component.chatToMove.set({ conversationID: 'conv-123' });

    component.closeMoveToProjectModal();

    expect(component.showMoveToProjectModal()).toBeFalse();
    expect(component.chatToMove()).toBeNull();
  });

  it('should remove chat from recents, sync cache and navigate to project route on onConversationMoved', () => {
    const chat1 = { conversationID: 'conv-1' };
    const chat2 = { conversationID: 'conv-2' };
    historyServiceMock.chats.set([chat1, chat2]);
    component.chatToMove.set(chat1);
    component.showMoveToProjectModal.set(true);

    component.onConversationMoved(10);

    expect(component.showMoveToProjectModal()).toBeFalse();
    expect(component.chatToMove()).toBeNull();
    expect(historyServiceMock.chats()).toEqual([chat2]);
    expect(historyServiceMock.syncCache).toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/projects/10/conv-1']);
    expect(sessionStorage.getItem('kai_active_project_id')).toBe('10');
    expect(sessionStorage.getItem('kai_active_project_conversation_id')).toBe('conv-1');
  });

  it('should clear conversation and select next chat on confirmProjectDelete when inside project conversation', async () => {
    const proj = { project_id: 10, project_name: 'Test Project' } as any;
    component.projectToDelete.set(proj);
    routerMock.url = '/projects/10/conv-1';
    sessionStorage.setItem('kai_active_project_id', '10');
    sessionStorage.setItem('kai_active_project_conversation_id', 'conv-1');

    const nextChat = { conversationID: 'conv-2' };
    historyServiceMock.chats.set([nextChat]);
    spyOn(component, 'openChat');
    spyOn(component.invalidConversation, 'emit');

    await component.confirmProjectDelete();

    expect(component.projectToDelete()).toBeNull();
    expect(sessionStorage.getItem('kai_active_project_id')).toBeNull();
    expect(sessionStorage.getItem('kai_active_project_conversation_id')).toBeNull();
    expect(component.invalidConversation.emit).toHaveBeenCalled();
    expect(component.openChat).toHaveBeenCalledWith(0);
  });

  it('should call newChat on confirmProjectDelete when no other chats exist', async () => {
    const proj = { project_id: 10, project_name: 'Test Project' } as any;
    component.projectToDelete.set(proj);
    routerMock.url = '/projects/10/conv-1';
    sessionStorage.setItem('kai_active_project_id', '10');

    historyServiceMock.chats.set([]);
    spyOn(component, 'newChat');

    await component.confirmProjectDelete();

    expect(component.newChat).toHaveBeenCalled();
  });

  it('should navigate to /projects on confirmProjectDelete when on project overview without conversation', async () => {
    const proj = { project_id: 10, project_name: 'Test Project' } as any;
    component.projectToDelete.set(proj);
    routerMock.url = '/projects/10';
    sessionStorage.removeItem('kai_active_project_id');
    sessionStorage.removeItem('kai_active_project_conversation_id');

    await component.confirmProjectDelete();

    expect(routerMock.navigate).toHaveBeenCalledWith(['/projects']);
  });

  // ── 14. Search ────────────────────────────────────────────────────────


  it('should open search modal', () => {
    spyOn(component.searchModalToggle, 'emit');

    component.openSearchModal();

    expect(component.showSearchModal).toBeTrue();
    expect(component.searchModalToggle.emit).toHaveBeenCalledWith(true);
  });

  it('should close search modal and reset search state', () => {
    spyOn(component.searchModalToggle, 'emit');
    component.showSearchModal = true;
    historyServiceMock.searchText.set('test query');
    historyServiceMock.searchResults.set([{ q: 'result' }]);

    component.closeSearchModal();

    expect(component.showSearchModal).toBeFalse();
    expect(component.searchText).toBe('');
    expect(component.searchResults).toEqual([]);
    expect(component.searchModalToggle.emit).toHaveBeenCalledWith(false);
  });

  it('should filter chats by conversationName', () => {
    historyServiceMock.chats.set([
      { conversationName: 'Angular Testing', conversation: [] },
      { conversationName: 'React Guide', conversation: [] },
      { conversation: [{ question: 'Angular question' }] },
    ]);
    historyServiceMock.searchText.set('angular');

    component.filterChats();

    expect(component.searchResults.length).toBe(2);
  });

  it('should clear search results and loading on empty query in triggerSearch', () => {
    historyServiceMock.searchText.set('');
    historyServiceMock.isSearchLoading.set(true);

    component.triggerSearch();

    expect(component.searchResults).toEqual([]);
    expect(component.isSearchLoading).toBeFalse();
  });

  // ── 15. Chat Selection ────────────────────────────────────────────────

  it('should emit chatSelected on openChat', () => {
    spyOn(component.chatSelected, 'emit');
    spyOn(component.closeMobileSidebar, 'emit');

    const chat = { conversationID: 'conv-1', conversation: [{ question: 'Q' }] };
    historyServiceMock.chats.set([chat]);

    component.openChat(0);

    expect(component.activeConversationID).toBe('conv-1');
    expect(component.chatSelected.emit).toHaveBeenCalledWith(chat);
    expect(component.closeMobileSidebar.emit).toHaveBeenCalled();
  });

  // ── 16. Active Chat Detection ─────────────────────────────────────────

  it('should detect active chat by conversationID', () => {
    historyServiceMock.activeConversationID.set('conv-1');
    expect(component.isActiveChat({ conversationID: 'conv-1' })).toBeTrue();
    expect(component.isActiveChat({ conversationID: 'conv-2' })).toBeFalse();
  });

  it('should detect active chat by tempId', () => {
    historyServiceMock.activeTempId.set('temp-1');
    expect(component.isActiveChat({ tempId: 'temp-1' })).toBeTrue();
    expect(component.isActiveChat({ tempId: 'temp-2' })).toBeFalse();
  });

  it('should return false for chat with no ID', () => {
    expect(component.isActiveChat({})).toBeFalse();
  });

  // ── 17. Action Disabled ───────────────────────────────────────────────

  it('should disable actions when no conversationID', () => {
    expect(component.isActionDisabled({})).toBeTrue();
  });

  it('should disable actions when status is not saved', () => {
    historyServiceMock.conversationStatuses.set({ 'conv-1': 'generating' });
    expect(component.isActionDisabled({ conversationID: 'conv-1' })).toBeTrue();
  });

  it('should enable actions when status is saved', () => {
    historyServiceMock.conversationStatuses.set({ 'conv-1': 'saved' });
    expect(component.isActionDisabled({ conversationID: 'conv-1' })).toBeFalse();
  });

  it('should enable actions when no status exists (older chat)', () => {
    historyServiceMock.conversationStatuses.set({});
    expect(component.isActionDisabled({ conversationID: 'conv-1' })).toBeFalse();
  });

  it('should return appropriate tooltip for generating status', () => {
    historyServiceMock.conversationStatuses.set({ 'conv-1': 'generating' });
    const tooltip = component.getDisabledTooltip({ conversationID: 'conv-1' });
    expect(tooltip).toContain('Pin/Delete will be available after the response');
  });

  it('should return wait tooltip when no conversationID', () => {
    const tooltip = component.getDisabledTooltip({});
    expect(tooltip).toContain('Wait for conversation');
  });

  // ── 18. Settings Modal ────────────────────────────────────────────────

  it('should open settings modal', () => {
    component.openSettingsModal();
    expect(component.showSettingsModal).toBeTrue();
  });

  it('should not open settings modal on unsupported page', () => {
    themeServiceMock.isThemeSupportedUrl.and.returnValue(false);
    component.openSettingsModal();
    expect(component.showSettingsModal).toBeFalse();
  });

  it('should close settings modal', () => {
    component.showSettingsModal = true;
    component.closeSettingsModal();
    expect(component.showSettingsModal).toBeFalse();
  });

  // ── 19. Theme ─────────────────────────────────────────────────────────

  it('should delegate setTheme to ThemeService', () => {
    component.setTheme('dark' as any);
    expect(themeServiceMock.setTheme).toHaveBeenCalledWith('dark');
  });

  it('should delegate setColorTheme to ThemeService', () => {
    component.setColorTheme('ocean' as any);
    expect(themeServiceMock.setColorTheme).toHaveBeenCalledWith('ocean');
  });

  it('should delegate setFontFamily to ThemeService', () => {
    component.setFontFamily('roboto' as any);
    expect(themeServiceMock.setFontFamily).toHaveBeenCalledWith('roboto');
  });

  // ── 20. Streaming Toggle ──────────────────────────────────────────────

  it('should emit streamingToggleEvt on toggle', () => {
    spyOn(component.streamingToggleEvt, 'emit');
    component.onStreamingToggle(true);
    expect(component.streamingToggleEvt.emit).toHaveBeenCalledWith(true);
  });

  // ── 21. Document Click ────────────────────────────────────────────────

  it('should close popover on outside click', () => {
    component.popoverOpen = true;
    const div = document.createElement('div');
    document.body.appendChild(div);
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', { value: div });

    component.onDocumentClick(event);
    expect(component.popoverOpen).toBeFalse();
    document.body.removeChild(div);
  });

  it('should close activeOptionsIndex on outside click', () => {
    component.activeOptionsIndex = 3;
    const div = document.createElement('div');
    document.body.appendChild(div);
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', { value: div });

    component.onDocumentClick(event);
    expect(component.activeOptionsIndex).toBeNull();
    document.body.removeChild(div);
  });

  // ── 22. Logout ────────────────────────────────────────────────────────

  it('should call azureAd.logout and navigate to /login on logout', () => {
    component.logout();
    expect(azureAdMock.logout).toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
  });

  // ── 23. Pin ───────────────────────────────────────────────────────────

  it('should delegate pinChat to historyService', () => {
    component.activeOptionsIndex = 0;
    component.pinChat(0);
    expect(historyServiceMock.pinChat).toHaveBeenCalledWith(0, 'test@test.com');
    expect(component.activeOptionsIndex).toBeNull();
  });

  // ── 24. History Toggle ────────────────────────────────────────────────

  it('should toggle showHistorySection', () => {
    expect(component.showHistorySection).toBeTrue();
    component.showHistory();
    expect(component.showHistorySection).toBeFalse();
    component.showHistory();
    expect(component.showHistorySection).toBeTrue();
  });

  // ── 25. Stable TrackBy ────────────────────────────────────────────────

  it('should return conversationID for trackByChat', () => {
    expect(component.trackByChat(0, { conversationID: 'conv-1' })).toBe('conv-1');
  });

  it('should return tempId when no conversationID for trackByChat', () => {
    expect(component.trackByChat(0, { tempId: 'temp-1' })).toBe('temp-1');
  });

  it('should return index-based fallback for trackByChat', () => {
    expect(component.trackByChat(5, {})).toBe('idx-5');
  });

  // ── 26. isGenerating ──────────────────────────────────────────────────

  it('should return false for isGenerating when chat is active conversation', () => {
    historyServiceMock.activeConversationID.set('conv-1');
    historyServiceMock.generatingStates.set({ 'conv-1': true });
    expect(component.isGenerating({ conversationID: 'conv-1' }, 0)).toBeFalse();
  });

  it('should return true for isGenerating when chat is not active and generating', () => {
    historyServiceMock.activeConversationID.set('conv-other');
    historyServiceMock.generatingStates.set({ 'conv-1': true });
    expect(component.isGenerating({ conversationID: 'conv-1' }, 0)).toBeTrue();
  });

  // ── 27. Font ──────────────────────────────────────────────────────────

  it('should toggle font dropdown', () => {
    const event = new Event('click');
    spyOn(event, 'stopPropagation');

    component.toggleFontDropdown(event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(component.fontDropdownOpen).toBeTrue();
    expect(component.fontSearchQuery).toBe('');
  });

  it('should select font family and close dropdown', () => {
    component.fontDropdownOpen = true;
    component.selectFontFamily('roboto' as any);
    expect(themeServiceMock.setFontFamily).toHaveBeenCalledWith('roboto');
    expect(component.fontDropdownOpen).toBeFalse();
    expect(component.fontSearchQuery).toBe('');
  });

  it('should filter font families by search query', () => {
    component.fontSearchQuery = '';
    const all = component.filteredFontFamilies;
    expect(all.length).toBe(FONT_FAMILIES.length);

    component.fontSearchQuery = 'zzzzNonExistent';
    expect(component.filteredFontFamilies.length).toBe(0);
  });

  // ── 28. Streaming Inside Settings ─────────────────────────────────────

  it('should handle streaming toggle inside settings', () => {
    spyOn(component.streamingToggleEvt, 'emit');
    const event = { target: { checked: true } };
    component.onStreamingToggleInsideSettings(event);
    expect(component.streaming).toBeTrue();
    expect(component.streamingToggleEvt.emit).toHaveBeenCalledWith(true);
  });

  // ── 29. Navigate To ──────────────────────────────────────────────────

  it('should navigate to given path', () => {
    component.navigateTo('/admin/dashboard');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/admin/dashboard']);
  });

  // ── 30. Dashboard ─────────────────────────────────────────────────────

  it('should navigate to /admin on dashboard call', () => {
    component.dashboard();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/admin']);
  });

  // ── 31. Global Keyboard Shortcuts ─────────────────────────────────────

  describe('Global Keyboard Shortcuts', () => {
    it('should open/close search modal on Ctrl+K', () => {
      spyOn(component, 'openSearchModal').and.callThrough();
      spyOn(component, 'closeSearchModal').and.callThrough();

      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
      window.dispatchEvent(event);

      expect(component.openSearchModal).toHaveBeenCalled();
      expect(component.showSearchModal).toBeTrue();

      const event2 = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
      window.dispatchEvent(event2);

      expect(component.closeSearchModal).toHaveBeenCalled();
      expect(component.showSearchModal).toBeFalse();
    });

    it('should trigger newChat on Ctrl+Shift+O and Ctrl+Shift+N', () => {
      spyOn(component, 'newChat').and.callThrough();

      const eventO = new KeyboardEvent('keydown', { key: 'O', ctrlKey: true, shiftKey: true, bubbles: true });
      window.dispatchEvent(eventO);
      expect(component.newChat).toHaveBeenCalledTimes(1);

      const eventN = new KeyboardEvent('keydown', { key: 'N', ctrlKey: true, shiftKey: true, bubbles: true });
      window.dispatchEvent(eventN);
      expect(component.newChat).toHaveBeenCalledTimes(2);
    });

    it('should open/close settings modal on Ctrl+,', () => {
      spyOn(component, 'openSettingsModal').and.callThrough();
      spyOn(component, 'closeSettingsModal').and.callThrough();

      const event = new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true });
      window.dispatchEvent(event);

      expect(component.openSettingsModal).toHaveBeenCalled();
      expect(component.showSettingsModal).toBeTrue();

      const event2 = new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true });
      window.dispatchEvent(event2);

      expect(component.closeSettingsModal).toHaveBeenCalled();
      expect(component.showSettingsModal).toBeFalse();
    });

    it('should not open settings modal on Ctrl+, if page is unsupported', () => {
      spyOn(component, 'openSettingsModal').and.callThrough();
      themeServiceMock.isThemeSupportedUrl.and.returnValue(false);

      const event = new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true });
      window.dispatchEvent(event);

      expect(component.openSettingsModal).not.toHaveBeenCalled();
      expect(component.showSettingsModal).toBeFalse();
    });

    it('should ignore keys without Ctrl or Meta modifier', () => {
      spyOn(component, 'openSearchModal');
      spyOn(component, 'newChat');
      spyOn(component, 'openSettingsModal');

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', shiftKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));

      expect(component.openSearchModal).not.toHaveBeenCalled();
      expect(component.newChat).not.toHaveBeenCalled();
      expect(component.openSettingsModal).not.toHaveBeenCalled();
    });
  });

  describe('Agent Accessibility Persistence', () => {
    it('should sync isAgentsAccessible into sessionStorage on ngOnInit', () => {
      tokenServiceMock.hasAgentAccess.and.returnValue(true);
      component.ngOnInit();
      expect(component.isAgentsAccessible()).toBeTrue();
      expect(sessionStorage.getItem('kai_is_agents_accessible')).toBe('true');
    });

    it('should honor sessionStorage if tokenService returns false on refresh', () => {
      sessionStorage.setItem('kai_is_agents_accessible', 'true');
      tokenServiceMock.hasAgentAccess.and.returnValue(false);
      component.ngOnInit();
      expect(component.isAgentsAccessible()).toBeTrue();
      expect(sessionStorage.getItem('kai_is_agents_accessible')).toBe('true');
    });
  });
});
