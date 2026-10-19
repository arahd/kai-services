import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Component, Directive, Input, Output, EventEmitter, Pipe, PipeTransform, NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { ChatbotComponent } from './chatbot.component';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ConfigService } from '@core/services/config.service';
import { ToastService } from '@core/services/toast.service';
import { TourService } from '@core/services/tour.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { MarkdownService } from '@shared/services/markdown.service';
import { ChatMessage } from '@shared/models';
import { ProjectStateService } from '@features/projects/services/project-state.service';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

// ── Stub Child Components ──────────────────────────────────────────────

@Component({ selector: 'app-welcome-state', standalone: true, template: '' })
class WelcomeStateStubComponent {
  @Input() cards: any[] = [];
  @Output() cardClick = new EventEmitter<any>();
}

@Component({ selector: 'app-user-message', standalone: true, template: '' })
class UserMessageStubComponent {
  @Input() msg: any;
  @Input() index = 0;
  @Input() copied: any = {};
  @Input() userAvatar: any = null;
  @Input() userName = '';
  @Output() edit = new EventEmitter<any>();
  @Output() reload = new EventEmitter<any>();
  @Output() copyMessage = new EventEmitter<any>();
  @Output() editMessage = new EventEmitter<any>();
  @Output() toggleCollapse = new EventEmitter<any>();
  @Output() previewFile = new EventEmitter<any>();
}

@Component({ selector: 'app-bot-message', standalone: true, template: '' })
class BotMessageStubComponent {
  @Input() msg: any;
  @Input() index = 0;
  @Input() copied: any = {};
  @Input() showActions = true;
  @Output() copyMessage = new EventEmitter<any>();
  @Output() shareMessage = new EventEmitter<any>();
  @Output() viewSources = new EventEmitter<any>();
  @Output() retryMessage = new EventEmitter<any>();
  @Output() previewImage = new EventEmitter<any>();
}

@Component({ selector: 'app-prompt-composer', standalone: true, template: '' })
class PromptComposerStubComponent {
  @Input() modelDropdownOpen = false;
  inputMessage = '';
  setInputMessage = jasmine.createSpy('setInputMessage');
  focus = jasmine.createSpy('focus');
  reset = jasmine.createSpy('reset');
  autoResize = jasmine.createSpy('autoResize');
  updateScrollIndicators = jasmine.createSpy('updateScrollIndicators');
}

@Component({ selector: 'app-file-preview-modal', standalone: true, template: '' })
class FilePreviewModalStubComponent {
  @Input() file: any;
}

@Component({ selector: 'app-chat-icon', standalone: true, template: '' })
class ChatIconStubComponent {
  @Input() name = '';
  @Input() width: any;
  @Input() height: any;
}

@Component({ selector: 'app-limit-popup', standalone: true, template: '' })
class LimitPopupStubComponent {
  @Output() close = new EventEmitter<void>();
}

@Component({ selector: 'app-session-expired-popup', standalone: true, template: '' })
class SessionExpiredPopupStubComponent {
  @Output() close = new EventEmitter<void>();
  @Output() newSession = new EventEmitter<void>();
}

@Component({ selector: 'app-common-popup', standalone: true, template: '' })
class CommonPopupStubComponent {
  @Input() show = false;
  @Input() title = '';
  @Input() message?: string;
  @Input() htmlContent?: string;
  @Input() items: any[] = [];
  @Input() type = 'info';
  @Output() closePopup = new EventEmitter<void>();
}

@Component({ selector: 'app-question-navigator', standalone: true, template: '' })
class QuestionNavigatorStubComponent {
  @Input() messages: any;
}

@Component({ selector: 'app-help-menu', standalone: true, template: '' })
class HelpMenuStubComponent {}

// ── Stub Directives ────────────────────────────────────────────────────

@Directive({ selector: '[appChatScroll]', standalone: true })
class ChatScrollStubDirective {
  @Input() isGenerating = false;
  @Input() chatScrollTrigger: any;
  onScroll = jasmine.createSpy('onScroll');
}

@Directive({ selector: '[appFileDragDrop]', standalone: true })
class FileDragDropStubDirective {
  @Output() filesDropped = new EventEmitter<FileList>();
  @Output() dragOverState = new EventEmitter<boolean>();
}

// ── Helper ─────────────────────────────────────────────────────────────

function createMockMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    sender: 'bot',
    message: 'Hello',
    timestamp: new Date(),
    responseType: 'text',
    status: 'completed',
    ...overrides,
  } as ChatMessage;
}

// ── Test Suite ─────────────────────────────────────────────────────────

describe('ChatbotComponent', () => {
  let component: ChatbotComponent;
  let fixture: ComponentFixture<ChatbotComponent>;

  // Service mocks
  let chatFacadeMock: any;
  let chatModelServiceMock: any;
  let chatStateMock: any;
  let chatScrollServiceMock: any;
  let chatServiceMock: any;
  let configServiceMock: any;
  let toastServiceMock: any;
  let tourServiceMock: any;
  let layoutBridgeMock: any;
  let markdownServiceMock: any;

  beforeEach(async () => {
    // ChatFacadeService mock
    chatFacadeMock = {
      history: {
        generatingStates: signal<{ [key: string]: boolean }>({}),
        streaming: signal<boolean>(false),
      },
      attachment: {
        filePreviews: signal<any[]>([]),
        activePreviewFile: signal<any>(null),
      },
      clipboard: {
        copyBotMessage: jasmine.createSpy('copyBotMessage'),
        copyUserMessage: jasmine.createSpy('copyUserMessage'),
        stripHtml: jasmine.createSpy('stripHtml').and.returnValue(''),
        shareMessage: jasmine.createSpy('shareMessage'),
      },
      azureAd: {
        logout: jasmine.createSpy('logout'),
      },
      addFiles: jasmine.createSpy('addFiles'),
    };

    chatModelServiceMock = {
      models: signal<any[]>([]),
      selectedModel: signal<string>(''),
    };

    chatStateMock = {
      currentConversation: signal<any>(null),
      conversations: signal<any[]>([]),
      currentLoadingMessage: signal<string>(''),
      showLimitPopup: signal<boolean>(false),
      showSessionExpiredPopup: signal<boolean>(false),
      initConversation: jasmine.createSpy('initConversation'),
      destroyConversation: jasmine.createSpy('destroyConversation'),
      createConversation: jasmine.createSpy('createConversation'),
      loadConversationData: jasmine.createSpy('loadConversationData').and.returnValue(Promise.resolve(null)),
      clearInvalidChat: jasmine.createSpy('clearInvalidChat'),
      sendMessage: jasmine.createSpy('sendMessage'),
      retryMessage: jasmine.createSpy('retryMessage'),
      isChatGenerating: jasmine.createSpy('isChatGenerating').and.returnValue(false),
      parseMessageTimestamp: jasmine.createSpy('parseMessageTimestamp').and.callFake((v: any) => {
        if (v instanceof Date) return v;
        return new Date(v || Date.now());
      }),
    };

    chatScrollServiceMock = {
      scrollAtBottom: signal<boolean>(true),
      activeMessageIndex: signal<number | null>(null),
      scrollToBottom: jasmine.createSpy('scrollToBottom'),
      scrollToQuestion: jasmine.createSpy('scrollToQuestion'),
      scrollToMessageIndex: jasmine.createSpy('scrollToMessageIndex'),
    };

    chatServiceMock = {
      getReportingModels: jasmine.createSpy('getReportingModels'),
    };

    configServiceMock = {
      getAzureUrl: jasmine.createSpy('getAzureUrl').and.returnValue('https://test-azure.com'),
      getConfig: jasmine.createSpy('getConfig').and.returnValue({
        chatbotUrl: '', azureUrl: '', hrportalUrl: '', kafUrl: '', kplatformUrl: '',
        azureAd: { clientId: '', tenantId: '', redirectUri: '', scopes: '' },
      }),
      configLoaded$: of(true),
    };

    toastServiceMock = {
      show: jasmine.createSpy('show'),
    };

    tourServiceMock = {
      startTourIfNotSeen: jasmine.createSpy('startTourIfNotSeen'),
    };

    layoutBridgeMock = {
      registerHost: jasmine.createSpy('registerHost'),
      unregisterHost: jasmine.createSpy('unregisterHost'),
      sidenavCollapsed: signal<boolean>(false),
    };

    markdownServiceMock = {
      render: jasmine.createSpy('render').and.returnValue(''),
    };

    await TestBed.configureTestingModule({
      imports: [ChatbotComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ChatFacadeService, useValue: chatFacadeMock },
        { provide: ChatModelService, useValue: chatModelServiceMock },
        { provide: ChatStateService, useValue: chatStateMock },
        { provide: ChatScrollService, useValue: chatScrollServiceMock },
        { provide: ChatService, useValue: chatServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: TourService, useValue: tourServiceMock },
        { provide: SidenavLayoutBridgeService, useValue: layoutBridgeMock },
        { provide: MarkdownService, useValue: markdownServiceMock },
        {
          provide: ProjectStateService,
          useValue: {
            getOrFetchProject: jasmine.createSpy('getOrFetchProject').and.returnValue(Promise.resolve(null)),
            loadProjectConversationMessages: jasmine.createSpy('loadProjectConversationMessages').and.returnValue(Promise.resolve(null)),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (k: string) => null,
              },
            },
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate'),
            events: of(),
            url: '/chatbot',
          },
        },
      ],
    })
      .overrideComponent(ChatbotComponent, {
        set: {
          imports: [
            CommonModule,
            FormsModule,
            WelcomeStateStubComponent,
            UserMessageStubComponent,
            BotMessageStubComponent,
            PromptComposerStubComponent,
            FilePreviewModalStubComponent,
            ChatIconStubComponent,
            LimitPopupStubComponent,
            SessionExpiredPopupStubComponent,
            CommonPopupStubComponent,
            ChatScrollStubDirective,
            FileDragDropStubDirective,
            QuestionNavigatorStubComponent,
            HelpMenuStubComponent,
            RouterOutlet,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatbotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── 1. Creation & Initial State ───────────────────────────────────────

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should have 3 default cards', () => {
    expect(component.defaultCards.length).toBe(3);
    expect(component.defaultCards[0].title).toBe('Image Generator');
    expect(component.defaultCards[1].title).toBe('Write Copy');
    expect(component.defaultCards[2].title).toBe('Write Code');
  });

  it('should initialize currentCards from defaultCards', () => {
    expect(component.currentCards.length).toBe(3);
  });

  it('should have showPopover as false initially', () => {
    expect(component.showPopover).toBeFalse();
  });

  it('should have sidebarOpen as false initially', () => {
    expect(component.sidebarOpen).toBeFalse();
  });

  it('should have isDragOverPage as false initially', () => {
    expect(component.isDragOverPage).toBeFalse();
  });

  // ── 2. Lifecycle (ngOnInit) ───────────────────────────────────────────

  it('should build upload and delete URLs from config on init', () => {
    expect(component.uploadUrl).toBe('https://test-azure.com/indexer/indexer');
    expect(component.deleteUrlBase).toBe('https://test-azure.com/indexer/delete');
  });

  it('should call chatState.initConversation() on init', () => {
    expect(chatStateMock.initConversation).toHaveBeenCalled();
  });

  it('should register a host with layoutBridge on init', () => {
    expect(layoutBridgeMock.registerHost).toHaveBeenCalledTimes(1);
  });

  // ── 3. Lifecycle (ngOnDestroy) ────────────────────────────────────────

  it('should unregister host and destroy conversation on destroy', () => {
    component.ngOnDestroy();
    expect(layoutBridgeMock.unregisterHost).toHaveBeenCalled();
    expect(chatStateMock.destroyConversation).toHaveBeenCalled();
  });

  // ── 4. Card Interactions ──────────────────────────────────────────────

  it('should delegate card prompt to promptComposer.setInputMessage', () => {
    // Need to set up ViewChild manually
    const stubComposer = new PromptComposerStubComponent();
    (component as any).promptComposer = stubComposer;

    component.handleCardClick({ prompt: 'Test prompt text' });
    expect(stubComposer.setInputMessage).toHaveBeenCalledWith('Test prompt text');
  });

  it('should handle card with no prompt gracefully', () => {
    const stubComposer = new PromptComposerStubComponent();
    (component as any).promptComposer = stubComposer;

    component.handleCardClick({});
    expect(stubComposer.setInputMessage).toHaveBeenCalledWith('');
  });

  // ── 5. Conversation Management ────────────────────────────────────────

  it('should call chatState.createConversation on createConversation()', () => {
    const stubComposer = new PromptComposerStubComponent();
    (component as any).promptComposer = stubComposer;

    component.createConversation();

    expect(chatScrollServiceMock.scrollToBottom).toHaveBeenCalled();
    expect(chatStateMock.createConversation).toHaveBeenCalled();
    expect(stubComposer.reset).toHaveBeenCalled();
  });

  it('should call chatState.loadConversationData on loadConversation()', fakeAsync(() => {
    const stubComposer = new PromptComposerStubComponent();
    (component as any).promptComposer = stubComposer;

    component.loadConversation({ conversationID: 'test-123', messages: [{ sender: 'user', message: 'hi' }] });
    tick();

    expect(chatScrollServiceMock.scrollToBottom).toHaveBeenCalled();
    expect(chatStateMock.loadConversationData).toHaveBeenCalled();
  }));

  // ── 6. Popup Management ───────────────────────────────────────────────

  it('should close limit popup', () => {
    chatStateMock.showLimitPopup.set(true);
    component.closeLimitPopup();
    expect(chatStateMock.showLimitPopup()).toBeFalse();
  });

  it('should close session expired popup', () => {
    chatStateMock.showSessionExpiredPopup.set(true);
    component.closeSessionExpiredPopup();
    expect(chatStateMock.showSessionExpiredPopup()).toBeFalse();
  });

  it('should handle expired session by closing popup and creating new conversation', () => {
    const stubComposer = new PromptComposerStubComponent();
    (component as any).promptComposer = stubComposer;

    chatStateMock.showSessionExpiredPopup.set(true);
    component.handleExpiredSession();

    expect(chatStateMock.showSessionExpiredPopup()).toBeFalse();
    expect(chatStateMock.createConversation).toHaveBeenCalled();
  });

  // ── 7. Message Actions ────────────────────────────────────────────────

  it('should toggle message collapse', () => {
    const msg = createMockMessage({ collapsed: false });
    component.toggleMessageCollapse(msg);
    expect(msg.collapsed).toBeTrue();

    component.toggleMessageCollapse(msg);
    expect(msg.collapsed).toBeFalse();
  });

  it('should delegate editUserMessage to promptComposer', () => {
    const stubComposer = new PromptComposerStubComponent();
    (component as any).promptComposer = stubComposer;

    const msg = createMockMessage({ sender: 'user', message: 'edit me' });
    component.editUserMessage(msg);
    expect(stubComposer.setInputMessage).toHaveBeenCalledWith('edit me');
  });

  it('should set editable to false on cancelEdit', () => {
    const msg = createMockMessage({ editable: true });
    component.cancelEdit(msg);
    expect(msg.editable).toBeFalse();
  });

  it('should delegate reloadUserMessage to chatState.sendMessage', () => {
    const msg = createMockMessage({ sender: 'user', message: 'reload this' });
    component.reloadUserMessage(msg);
    expect(chatStateMock.sendMessage).toHaveBeenCalledWith('reload this', []);
  });

  // ── 8. Toggle & UI State ──────────────────────────────────────────────

  it('should toggle sidebarOpen', () => {
    expect(component.sidebarOpen).toBeFalse();
    component.toggleSidebar();
    expect(component.sidebarOpen).toBeTrue();
    component.toggleSidebar();
    expect(component.sidebarOpen).toBeFalse();
  });

  it('should toggle popover and stop propagation', () => {
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');

    component.togglePopover(event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(component.showPopover).toBeTrue();

    component.togglePopover(event);
    expect(component.showPopover).toBeFalse();
  });

  it('should set body overflow on mobileSidebarOpen setter', () => {
    component.mobileSidebarOpen = true;
    expect(component.mobileSidebarOpen).toBeTrue();

    component.mobileSidebarOpen = false;
    expect(component.mobileSidebarOpen).toBeFalse();
  });

  // ── 9. Date Separators ────────────────────────────────────────────────

  describe('Date Separators', () => {
    it('should show date separator for first message', () => {
      const now = new Date();
      chatStateMock.currentConversation.set({
        id: 1,
        title: 'Test',
        messages: [createMockMessage({ timestamp: now })],
        conversationID: 'conv-1',
      });

      expect(component.shouldShowDateSeparator(0)).toBeTrue();
    });

    it('should return false when no conversation', () => {
      chatStateMock.currentConversation.set(null);
      expect(component.shouldShowDateSeparator(0)).toBeFalse();
    });

    it('should return "Today" for today\'s date', () => {
      const now = new Date();
      chatStateMock.currentConversation.set({
        id: 1,
        title: 'Test',
        messages: [createMockMessage({ timestamp: now })],
        conversationID: 'conv-1',
      });

      expect(component.getDateSeparatorLabel(0)).toBe('Today');
    });

    it('should return "Yesterday" for yesterday\'s date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      chatStateMock.currentConversation.set({
        id: 1,
        title: 'Test',
        messages: [createMockMessage({ timestamp: yesterday })],
        conversationID: 'conv-1',
      });

      expect(component.getDateSeparatorLabel(0)).toBe('Yesterday');
    });

    it('should return formatted date for older messages', () => {
      const oldDate = new Date('2025-01-15');
      chatStateMock.currentConversation.set({
        id: 1,
        title: 'Test',
        messages: [createMockMessage({ timestamp: oldDate })],
        conversationID: 'conv-1',
      });

      const label = component.getDateSeparatorLabel(0);
      expect(label).toBeTruthy();
      expect(label).not.toBe('Today');
      expect(label).not.toBe('Yesterday');
    });

    it('should return empty string when no conversation for getDateSeparatorLabel', () => {
      chatStateMock.currentConversation.set(null);
      expect(component.getDateSeparatorLabel(0)).toBe('');
    });
  });

  // ── 10. File Drag & Drop ──────────────────────────────────────────────

  it('should delegate onFilesDropped to chatFacade.addFiles', () => {
    chatStateMock.currentConversation.set({
      id: 1,
      title: 'Test',
      messages: [],
      conversationID: 'conv-1',
    });

    const mockFileList = { length: 1, item: () => null } as unknown as FileList;
    component.onFilesDropped(mockFileList);

    expect(chatFacadeMock.addFiles).toHaveBeenCalledWith(mockFileList, 'conv-1');
    expect(component.showPopover).toBeFalse();
  });

  // ── 11. Message Action Visibility ─────────────────────────────────────

  describe('Message Action Visibility', () => {
    it('should return false for user messages', () => {
      const msg = createMockMessage({ sender: 'user', role: 'user', status: 'completed' });
      expect(component.canShowMessageActions(msg)).toBeFalse();
    });

    it('should return false for placeholder messages', () => {
      const msg = createMockMessage({ sender: 'bot', role: 'assistant', status: 'completed', isPlaceholder: true });
      expect(component.canShowMessageActions(msg)).toBeFalse();
    });

    it('should return false for non-completed messages', () => {
      const msg = createMockMessage({ sender: 'bot', role: 'assistant', status: 'streaming' });
      expect(component.canShowMessageActions(msg)).toBeFalse();
    });

    it('should return true for bot message with text content', () => {
      const msg = createMockMessage({
        sender: 'bot',
        role: 'assistant',
        status: 'completed',
        message: 'Hello world',
      });
      expect(component.canShowTextActions(msg)).toBeTrue();
    });

    it('should return true for bot message with images', () => {
      const msg = createMockMessage({
        sender: 'bot',
        role: 'assistant',
        status: 'completed',
        images: [{ url: 'http://img.png', name: 'test.png' }],
        isImageLoading: false,
        imageLoadError: false,
      });
      expect(component.canShowImageActions(msg)).toBeTrue();
    });

    it('should return false for image actions when loading', () => {
      const msg = createMockMessage({
        images: [{ url: 'http://img.png', name: 'test.png' }],
        isImageLoading: true,
      });
      expect(component.canShowImageActions(msg)).toBeFalse();
    });

    it('should return true for bot message with documents', () => {
      const msg = createMockMessage({
        sender: 'bot',
        role: 'assistant',
        status: 'completed',
        documents: [{ url: 'http://doc.pdf', name: 'test.pdf', extension: 'pdf' }],
        isDocumentLoading: false,
        documentLoadError: false,
      });
      expect(component.canShowDocumentActions(msg)).toBeTrue();
    });

    it('should return false for canShowTextActions with empty text', () => {
      const msg = createMockMessage({ message: '', html: '', content: '' });
      expect(component.canShowTextActions(msg)).toBeFalse();
    });
  });

  // ── 12. Click Outside ─────────────────────────────────────────────────

  it('should close showPopover on clickOutside when clicking outside popover', () => {
    component.showPopover = true;
    const div = document.createElement('div');
    document.body.appendChild(div);
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: div });

    component.clickOutside(event);
    expect(component.showPopover).toBeFalse();
    document.body.removeChild(div);
  });

  // ── 13. Unload Guard ──────────────────────────────────────────────────

  it('should set returnValue when generating on beforeunload', () => {
    chatFacadeMock.history.generatingStates.set({ 'conv-1': true });

    const event: any = { preventDefault: jasmine.createSpy('preventDefault') };
    component.unloadNotification(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe('');
  });

  it('should not interfere with beforeunload when not generating', () => {
    chatFacadeMock.history.generatingStates.set({});

    const event: any = { preventDefault: jasmine.createSpy('preventDefault') };
    component.unloadNotification(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  // ── 14. Suggestion Handling ───────────────────────────────────────────

  it('should delegate handleSuggestionClick to promptComposer', () => {
    const stubComposer = new PromptComposerStubComponent();
    (component as any).promptComposer = stubComposer;

    chatStateMock.currentConversation.set({
      id: 1,
      title: 'Test',
      messages: [],
      conversationID: 'conv-1',
    });

    component.handleSuggestionClick('What is AI?');
    expect(stubComposer.setInputMessage).toHaveBeenCalledWith('What is AI?');
  });

  it('should not handle suggestion when no conversation', () => {
    const stubComposer = new PromptComposerStubComponent();
    (component as any).promptComposer = stubComposer;

    chatStateMock.currentConversation.set(null);
    component.handleSuggestionClick('What is AI?');
    expect(stubComposer.setInputMessage).not.toHaveBeenCalled();
  });

  it('should not handle suggestion when chat is generating', () => {
    const stubComposer = new PromptComposerStubComponent();
    (component as any).promptComposer = stubComposer;

    chatStateMock.currentConversation.set({
      id: 1,
      title: 'Test',
      messages: [],
      conversationID: 'conv-1',
    });
    chatStateMock.isChatGenerating.and.returnValue(true);

    component.handleSuggestionClick('What is AI?');
    expect(stubComposer.setInputMessage).not.toHaveBeenCalled();
  });

  // ── 15. Additional Utility ────────────────────────────────────────────

  it('should return isAnyGenerating true when a state is generating', () => {
    chatFacadeMock.history.generatingStates.set({ 'conv-1': true, 'conv-2': false });
    expect(component.isAnyGenerating()).toBeTrue();
  });

  it('should return isAnyGenerating false when no state is generating', () => {
    chatFacadeMock.history.generatingStates.set({ 'conv-1': false, 'conv-2': false });
    expect(component.isAnyGenerating()).toBeFalse();
  });

  it('should delegate logout to chatFacade.azureAd.logout', () => {
    component.logout();
    expect(chatFacadeMock.azureAd.logout).toHaveBeenCalled();
  });

  it('should delegate scrollToBottom to chatScrollService', () => {
    component.scrollToBottom();
    expect(chatScrollServiceMock.scrollToBottom).toHaveBeenCalled();
  });

  it('should delegate stripHtml to chatFacade.clipboard', () => {
    component.stripHtml('<b>test</b>');
    expect(chatFacadeMock.clipboard.stripHtml).toHaveBeenCalledWith('<b>test</b>');
  });

  it('should delegate shareMessage to chatFacade.clipboard', () => {
    const msg = createMockMessage();
    component.shareMessage(msg);
    expect(chatFacadeMock.clipboard.shareMessage).toHaveBeenCalledWith(msg);
  });

  it('should open aug url popup', () => {
    const data = [{ source: 'url1' }];
    component.openAugUrlPopup(data);
    expect(component.augUrls).toEqual(data);
    expect(component.showPopup).toBeTrue();
  });

  it('should close popup on onPopupClose', () => {
    component.showPopup = true;
    component.onPopupClose();
    expect(component.showPopup).toBeFalse();
  });

  it('should return true for hasContextAndSource when augurls have source', () => {
    expect(component.hasContextAndSource([{ source: 'test' }])).toBeTrue();
  });

  it('should return false for hasContextAndSource when undefined', () => {
    expect(component.hasContextAndSource(undefined)).toBeFalse();
  });

  it('should return false for hasContextAndSource when no source', () => {
    expect(component.hasContextAndSource([{ noSource: true }])).toBeFalse();
  });

  it('should handle search modal toggle open', () => {
    component.onSearchModalToggle(true);
    expect(chatScrollServiceMock.scrollAtBottom()).toBeTrue();
  });

  it('should handle search modal toggle close without chatScroll', () => {
    (component as any).chatScroll = undefined;
    component.onSearchModalToggle(false);
    expect(chatScrollServiceMock.scrollAtBottom()).toBeTrue();
  });

  it('should preview bot image through chatFacade', () => {
    component.previewBotImage({ url: 'http://img.png', name: 'photo' });
    expect(chatFacadeMock.attachment.activePreviewFile()).toBeTruthy();
    expect(chatFacadeMock.attachment.activePreviewFile().name).toBe('photo.png');
  });

  it('should not retry message when no conversation', () => {
    chatStateMock.currentConversation.set(null);
    component.retryMessage(0);
    expect(chatStateMock.retryMessage).not.toHaveBeenCalled();
  });

  it('should retry message when conversation exists and not generating', () => {
    chatStateMock.currentConversation.set({
      id: 1,
      title: 'Test',
      messages: [],
      conversationID: 'conv-1',
    });
    chatStateMock.isChatGenerating.and.returnValue(false);

    component.retryMessage(2);
    expect(chatStateMock.retryMessage).toHaveBeenCalledWith(2);
  });

  it('should not retry message when chat is generating', () => {
    chatStateMock.currentConversation.set({
      id: 1,
      title: 'Test',
      messages: [],
      conversationID: 'conv-1',
    });
    chatStateMock.isChatGenerating.and.returnValue(true);

    component.retryMessage(2);
    expect(chatStateMock.retryMessage).not.toHaveBeenCalled();
  });

  describe('Project Group Header Breadcrumb', () => {
    it('should not show project breadcrumb by default when not in a project', () => {
      component.activeProjectBreadcrumb.set(null);
      fixture.detectChanges();
      const breadcrumbEl = fixture.nativeElement.querySelector('.project-chat-breadcrumb-bar');
      expect(breadcrumbEl).toBeNull();
    });

    it('should set activeProjectBreadcrumb signal when configured', () => {
      component.activeProjectBreadcrumb.set({
        projectId: '101',
        projectName: 'SharePoint',
      });
      expect(component.activeProjectBreadcrumb()?.projectName).toBe('SharePoint');
      expect(component.activeProjectBreadcrumb()?.projectId).toBe('101');
    });

    it('should navigate to /projects when goToProjects is called', () => {
      const routerSpy = jasmine.createSpyObj('Router', ['navigate']);
      (component as any).router = routerSpy;

      component.goToProjects();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/projects']);
    });

    it('should navigate to /projects/:id when goToProject is called with id or active project', () => {
      const routerSpy = jasmine.createSpyObj('Router', ['navigate']);
      (component as any).router = routerSpy;

      component.activeProjectBreadcrumb.set({
        projectId: '101',
        projectName: 'SharePoint',
      });

      component.goToProject('101');
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/projects', '101']);

      component.goToProject();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/projects', '101']);
    });
  });
});
