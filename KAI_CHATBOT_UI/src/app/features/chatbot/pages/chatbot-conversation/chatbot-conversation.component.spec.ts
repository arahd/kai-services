import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Component, Directive, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { ChatbotConversationComponent } from './chatbot-conversation.component';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { ProjectStateService } from '@features/projects/services/project-state.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { ToastService } from '@core/services/toast.service';
import { ChatMessage } from '@shared/models';

// ── Stub Child Components & Directives ─────────────────────────────────

@Component({ selector: 'app-user-message', standalone: true, template: '' })
class UserMessageStubComponent {
  @Input() msg: any;
  @Input() index = 0;
  @Input() copied: any = false;
  @Input() userAvatar: any = null;
  @Input() userName = '';
  @Output() copyMessage = new EventEmitter<any>();
  @Output() editMessage = new EventEmitter<any>();
  @Output() toggleCollapse = new EventEmitter<any>();
}

@Component({ selector: 'app-bot-message', standalone: true, template: '' })
class BotMessageStubComponent {
  @Input() msg: any;
  @Input() index = 0;
  @Input() copied: any = false;
  @Input() showActions = true;
  @Output() copyMessage = new EventEmitter<any>();
  @Output() shareMessage = new EventEmitter<any>();
  @Output() viewSources = new EventEmitter<any>();
  @Output() retryMessage = new EventEmitter<any>();
  @Output() previewImage = new EventEmitter<any>();
}

@Component({ selector: 'app-prompt-composer', standalone: true, template: '' })
class PromptComposerStubComponent {
  inputMessage = '';
  setInputMessage = jasmine.createSpy('setInputMessage');
  focus = jasmine.createSpy('focus');
}

@Component({ selector: 'app-question-navigator', standalone: true, template: '' })
class QuestionNavigatorStubComponent {
  @Input() messages: any;
}

@Component({ selector: 'app-chat-icon', standalone: true, template: '' })
class ChatIconStubComponent {
  @Input() name = '';
  @Input() width: any;
  @Input() height: any;
}

@Component({ selector: 'app-common-popup', standalone: true, template: '' })
class CommonPopupStubComponent {
  @Input() show = false;
  @Input() title = '';
  @Input() items: any[] = [];
  @Output() closePopup = new EventEmitter<void>();
}

@Directive({ selector: '[appChatScroll]', standalone: true })
class ChatScrollStubDirective {
  @Input() isGenerating = false;
  @Input() chatScrollTrigger: any;
}

// ── Helpers ────────────────────────────────────────────────────────────

function createMockMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    sender: 'bot',
    message: 'Hello World',
    status: 'completed',
    timestamp: new Date(),
    ...overrides,
  } as ChatMessage;
}

// ── Test Suite ─────────────────────────────────────────────────────────

describe('ChatbotConversationComponent', () => {
  let component: ChatbotConversationComponent;
  let fixture: ComponentFixture<ChatbotConversationComponent>;

  let chatStateMock: any;
  let chatFacadeMock: any;
  let chatScrollServiceMock: any;
  let projectStateMock: any;
  let storageServiceMock: any;
  let toastServiceMock: any;
  let routerMock: any;
  let activatedRouteMock: any;

  beforeEach(async () => {
    sessionStorage.clear();

    chatStateMock = {
      userInfo: {
        name: 'Jane Doe',
        avatar: 'avatar.png',
        email: 'jane@example.com',
      },
      currentConversation: signal<any>(null),
      isChatGenerating: jasmine.createSpy('isChatGenerating').and.returnValue(false),
      loadConversationData: jasmine.createSpy('loadConversationData').and.returnValue(Promise.resolve()),
      createConversation: jasmine.createSpy('createConversation').and.returnValue({
        id: 1,
        conversationID: 'conv-new',
        messages: [],
      }),
      sendMessage: jasmine.createSpy('sendMessage'),
      retryMessage: jasmine.createSpy('retryMessage'),
      restoreFromMemory: jasmine.createSpy('restoreFromMemory').and.returnValue(true),
      hasInMemoryConversation: jasmine.createSpy('hasInMemoryConversation').and.returnValue(false),
      parseMessageTimestamp: jasmine.createSpy('parseMessageTimestamp').and.callFake((ts: any) => {
        return ts instanceof Date ? ts : new Date(ts || Date.now());
      }),
    };

    chatFacadeMock = {
      history: {
        loadConversationMessages: jasmine.createSpy('loadConversationMessages').and.callFake(
          (email: string, id: string, success: Function) => {
            success({ conversationID: id, conversation: [{ sender: 'user', message: 'Hi' }] });
          }
        ),
        activeConversationID: signal<string>(''),
        generatingStates: signal<{ [key: string]: boolean }>({}),
        streaming: signal<boolean>(false),
      },
      clipboard: {
        copyUserMessage: jasmine.createSpy('copyUserMessage').and.callFake((msg: any, idx: number, cb: Function) => cb(idx)),
        copyBotMessage: jasmine.createSpy('copyBotMessage').and.callFake((msg: any, idx: number, cb: Function) => cb(idx, 'Copied!')),
        shareMessage: jasmine.createSpy('shareMessage'),
      },
      token: {
        getUserInfo: jasmine.createSpy('getUserInfo').and.returnValue({ email: 'jane@example.com' }),
      },
      attachment: {
        activePreviewFile: signal<any>(null),
        pendingAttachments: signal<any[]>([]),
      },
    };

    chatScrollServiceMock = {
      scrollToBottom: jasmine.createSpy('scrollToBottom'),
    };

    projectStateMock = {
      getOrFetchProject: jasmine.createSpy('getOrFetchProject').and.returnValue(
        Promise.resolve({ project_id: 1, project_name: 'Project Phoenix' })
      ),
      loadProjectConversationMessages: jasmine.createSpy('loadProjectConversationMessages').and.returnValue(
        Promise.resolve({ conversationName: 'Design Chat', conversation: [{ sender: 'user', message: 'Hello' }] })
      ),
    };

    storageServiceMock = {
      setConversationId: jasmine.createSpy('setConversationId'),
      setLastActiveConversationId: jasmine.createSpy('setLastActiveConversationId'),
    };

    toastServiceMock = {
      show: jasmine.createSpy('show'),
    };

    routerMock = {
      navigate: jasmine.createSpy('navigate'),
      url: '/chatbot/conv-123',
    };

    activatedRouteMock = {
      snapshot: {
        paramMap: {
          get: jasmine.createSpy('get').and.callFake((key: string) => {
            if (key === 'convoId' || key === 'conversationId') return 'conv-123';
            return null;
          }),
        },
      },
    };

    await TestBed.configureTestingModule({
      imports: [ChatbotConversationComponent],
      providers: [
        { provide: ChatStateService, useValue: chatStateMock },
        { provide: ChatFacadeService, useValue: chatFacadeMock },
        { provide: ChatScrollService, useValue: chatScrollServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: SessionStorageService, useValue: storageServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: ActivatedRoute, useValue: activatedRouteMock },
      ],
    })
      .overrideComponent(ChatbotConversationComponent, {
        set: {
          imports: [
            CommonModule,
            UserMessageStubComponent,
            BotMessageStubComponent,
            PromptComposerStubComponent,
            QuestionNavigatorStubComponent,
            ChatIconStubComponent,
            CommonPopupStubComponent,
            ChatScrollStubDirective,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatbotConversationComponent);
    component = fixture.componentInstance;

    spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  describe('conversationBreadcrumbName computed signal', () => {
    it('should return "Chat" when currentConversation is null', () => {
      chatStateMock.currentConversation.set(null);
      expect(component.conversationBreadcrumbName()).toBe('Chat');
    });

    it('should return valid conversation title when meaningful', () => {
      chatStateMock.currentConversation.set({
        title: 'Project Kickoff Meeting',
        messages: [],
      });
      expect(component.conversationBreadcrumbName()).toBe('Project Kickoff Meeting');
    });

    it('should ignore "New Chat" and "Untitled" and fallback to first user message', () => {
      chatStateMock.currentConversation.set({
        title: 'New Chat',
        messages: [
          createMockMsg({ sender: 'bot', message: 'Welcome' }),
          createMockMsg({ sender: 'user', message: 'How does caching work?' }),
        ],
      });
      expect(component.conversationBreadcrumbName()).toBe('How does caching work?');
    });

    it('should fallback to "Chat" if title is "Untitled" and no user message exists', () => {
      chatStateMock.currentConversation.set({
        title: 'Untitled',
        messages: [createMockMsg({ sender: 'bot', message: 'Welcome' })],
      });
      expect(component.conversationBreadcrumbName()).toBe('Chat');
    });
  });

  describe('Date separator logic', () => {
    it('should return true for index 0 when messages exist', () => {
      chatStateMock.currentConversation.set({
        messages: [createMockMsg()],
      });
      expect(component.shouldShowDateSeparator(0)).toBeTrue();
    });

    it('should return false if previous and current message share the same date', () => {
      const now = new Date();
      chatStateMock.currentConversation.set({
        messages: [
          createMockMsg({ timestamp: now }),
          createMockMsg({ timestamp: new Date(now.getTime() + 1000) }),
        ],
      });
      expect(component.shouldShowDateSeparator(1)).toBeFalse();
    });

    it('should return true if previous and current message are on different days', () => {
      const day1 = new Date(2026, 8, 1);
      const day2 = new Date(2026, 8, 2);
      chatStateMock.currentConversation.set({
        messages: [
          createMockMsg({ timestamp: day1 }),
          createMockMsg({ timestamp: day2 }),
        ],
      });
      expect(component.shouldShowDateSeparator(1)).toBeTrue();
    });

    it('should return "Today" if message date is today', () => {
      chatStateMock.currentConversation.set({
        messages: [createMockMsg({ timestamp: new Date() })],
      });
      expect(component.getDateSeparatorLabel(0)).toBe('Today');
    });

    it('should return "Yesterday" if message date was yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      chatStateMock.currentConversation.set({
        messages: [createMockMsg({ timestamp: yesterday })],
      });
      expect(component.getDateSeparatorLabel(0)).toBe('Yesterday');
    });

    it('should format date string for dates older than yesterday', () => {
      const oldDate = new Date(2025, 0, 15);
      chatStateMock.currentConversation.set({
        messages: [createMockMsg({ timestamp: oldDate })],
      });
      const label = component.getDateSeparatorLabel(0);
      expect(label).toContain('Jan 15');
    });
  });

  describe('canShowMessageActions', () => {
    it('should return false if sender is not bot or assistant', () => {
      const msg = createMockMsg({ sender: 'user', status: 'completed' });
      expect(component.canShowMessageActions(msg)).toBeFalse();
    });

    it('should return false if status is not completed', () => {
      const msg = createMockMsg({ sender: 'bot', status: 'streaming' });
      expect(component.canShowMessageActions(msg)).toBeFalse();
    });

    it('should return false if isPlaceholder is true', () => {
      const msg = createMockMsg({ sender: 'bot', status: 'completed', isPlaceholder: true });
      expect(component.canShowMessageActions(msg)).toBeFalse();
    });

    it('should return false if image or document is loading', () => {
      const msg1 = createMockMsg({ sender: 'bot', status: 'completed', isImageLoading: true });
      const msg2 = createMockMsg({ sender: 'bot', status: 'completed', isDocumentLoading: true });
      expect(component.canShowMessageActions(msg1)).toBeFalse();
      expect(component.canShowMessageActions(msg2)).toBeFalse();
    });

    it('should return true for completed bot message with text', () => {
      const msg = createMockMsg({ sender: 'bot', status: 'completed', message: 'All done.' });
      expect(component.canShowMessageActions(msg)).toBeTrue();
    });

    it('should return true for completed bot message with images', () => {
      const msg = createMockMsg({
        sender: 'bot',
        status: 'completed',
        message: '',
        images: [{ url: 'image.png', name: 'img' }],
      });
      expect(component.canShowMessageActions(msg)).toBeTrue();
    });

    it('should return true for completed bot message with documents', () => {
      const msg = createMockMsg({
        sender: 'bot',
        status: 'completed',
        message: '',
        documents: [{ url: 'doc.pdf', name: 'doc', extension: 'pdf' }],
      });
      expect(component.canShowMessageActions(msg)).toBeTrue();
    });
  });

  describe('Message user interactions', () => {
    it('copyUserMessage should trigger clipboard and manage copied state', fakeAsync(() => {
      const msg = createMockMsg({ sender: 'user' });
      component.copyUserMessage(msg, 2);

      expect(chatFacadeMock.clipboard.copyUserMessage).toHaveBeenCalledWith(msg, 2, jasmine.any(Function));
      expect(component.copied[2]).toBeTrue();

      tick(1500);
      expect(component.copied[2]).toBeFalse();
    }));

    it('copyBotMessage should trigger clipboard, toast, and manage copied state', fakeAsync(() => {
      const msg = createMockMsg({ sender: 'bot' });
      component.copyBotMessage(msg, 1);

      expect(chatFacadeMock.clipboard.copyBotMessage).toHaveBeenCalledWith(msg, 1, jasmine.any(Function));
      expect(component.copied[1]).toBeTrue();
      expect(toastServiceMock.show).toHaveBeenCalledWith('Copied!', 'success');

      tick(1500);
      expect(component.copied[1]).toBeFalse();
    }));

    it('editUserMessage should set input message on composer and focus', fakeAsync(() => {
      const mockComposer = {
        setInputMessage: jasmine.createSpy('setInputMessage'),
        focus: jasmine.createSpy('focus'),
      };
      component.promptComposer = mockComposer as any;

      const msg = createMockMsg({ sender: 'user', message: 'Original text' });
      component.editUserMessage(msg);

      expect(mockComposer.setInputMessage).toHaveBeenCalledWith('Original text');
      tick();
      expect(mockComposer.focus).toHaveBeenCalled();
    }));

    it('toggleMessageCollapse should toggle collapsed state', () => {
      const msg = createMockMsg({ collapsed: false });
      component.toggleMessageCollapse(msg);
      expect(msg.collapsed).toBeTrue();
      component.toggleMessageCollapse(msg);
      expect(msg.collapsed).toBeFalse();
    });

    it('shareMessage should call clipboard shareMessage', () => {
      const msg = createMockMsg();
      component.shareMessage(msg);
      expect(chatFacadeMock.clipboard.shareMessage).toHaveBeenCalledWith(msg);
    });

    it('retryMessage should call chatState.retryMessage when not generating', () => {
      chatStateMock.currentConversation.set({
        conversationID: 'conv-123',
        id: 123,
      });
      chatStateMock.isChatGenerating.and.returnValue(false);

      component.retryMessage(3);
      expect(chatStateMock.retryMessage).toHaveBeenCalledWith(3);
    });

    it('retryMessage should not call retryMessage if already generating', () => {
      chatStateMock.currentConversation.set({
        conversationID: 'conv-123',
        id: 123,
      });
      chatStateMock.isChatGenerating.and.returnValue(true);

      component.retryMessage(3);
      expect(chatStateMock.retryMessage).not.toHaveBeenCalled();
    });

    it('handleSuggestionClick should populate prompt composer and focus', fakeAsync(() => {
      chatStateMock.currentConversation.set({
        conversationID: 'conv-123',
        id: 123,
      });
      chatStateMock.isChatGenerating.and.returnValue(false);

      const mockComposer = {
        setInputMessage: jasmine.createSpy('setInputMessage'),
        focus: jasmine.createSpy('focus'),
      };
      component.promptComposer = mockComposer as any;

      component.handleSuggestionClick('Tell me more about Angular');
      expect(mockComposer.setInputMessage).toHaveBeenCalledWith('Tell me more about Angular');
      tick();
      expect(mockComposer.focus).toHaveBeenCalled();
    }));

    it('previewBotImage should set activePreviewFile in attachment service', () => {
      component.previewBotImage({ url: 'http://example.com/test.png', name: 'test' });
      const active = chatFacadeMock.attachment.activePreviewFile();
      expect(active).toBeTruthy();
      expect(active.previewUrl).toBe('http://example.com/test.png');
      expect(active.name).toBe('test.png');
    });

    it('openAugUrlPopup and onPopupClose should control popup state', () => {
      component.openAugUrlPopup(['https://link1.com', 'https://link2.com']);
      expect(component.showPopup).toBeTrue();
      expect(component.augUrls.length).toBe(2);

      component.onPopupClose();
      expect(component.showPopup).toBeFalse();
    });
  });

  describe('Navigation & Projects Routing', () => {
    it('goToProjects should navigate to /projects', () => {
      component.goToProjects();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/projects']);
    });

    it('goToProject should navigate to specific project id', () => {
      component.goToProject(42);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/projects', 42]);
    });

    it('goToProject without param should fallback to activeProjectBreadcrumb id', () => {
      component.activeProjectBreadcrumb.set({ projectId: 99, projectName: 'Project 99' });
      component.goToProject();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/projects', 99]);
    });

    it('goToProject without any id should navigate to /projects', () => {
      component.activeProjectBreadcrumb.set(null);
      component.goToProject();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/projects']);
    });
  });

  describe('Conversation Loading', () => {
    it('should load standard conversation messages via chatFacade.history', fakeAsync(() => {
      component.ngOnInit();
      tick(150);

      expect(chatFacadeMock.history.loadConversationMessages).toHaveBeenCalledWith(
        'jane@example.com',
        'conv-123',
        jasmine.any(Function),
        jasmine.any(Function)
      );
      expect(chatStateMock.loadConversationData).toHaveBeenCalled();
      expect(storageServiceMock.setConversationId).toHaveBeenCalledWith('conv-123');
      expect(chatScrollServiceMock.scrollToBottom).toHaveBeenCalled();
    }));

    it('should handle loadConversationMessages error by showing toast and navigating away', fakeAsync(() => {
      chatFacadeMock.history.loadConversationMessages.and.callFake(
        (email: string, id: string, success: Function, failure: Function) => {
          failure(new Error('Not found'));
        }
      );

      component.ngOnInit();
      tick(150);

      expect(toastServiceMock.show).toHaveBeenCalledWith(
        'Conversation not found or has been deleted',
        'error'
      );
      expect(routerMock.navigate).toHaveBeenCalledWith(['/chatbot'], { replaceUrl: true });
    }));

    it('should reuse in-memory conversation if already loaded, matching, and completed', fakeAsync(() => {
      chatStateMock.currentConversation.set({
        conversationID: 'conv-123',
        messages: [
          createMockMsg({ sender: 'user', message: 'Hello' }),
          createMockMsg({ sender: 'bot', message: 'Done', status: 'completed' }),
        ],
      });
      chatStateMock.isChatGenerating.and.returnValue(false);

      component.ngOnInit();
      tick();

      // Should not call backend API because it is already complete and matching
      expect(chatFacadeMock.history.loadConversationMessages).not.toHaveBeenCalled();
    }));

    it('should NOT call loadConversationMessages when conversation is actively generating', fakeAsync(() => {
      chatStateMock.currentConversation.set({
        conversationID: 'conv-123',
        messages: [
          createMockMsg({ sender: 'user', message: 'Hello' }),
          createMockMsg({ sender: 'bot', message: '', status: 'streaming', isPlaceholder: true }),
        ],
      });
      chatStateMock.isChatGenerating.and.returnValue(true);

      component.ngOnInit();
      tick();

      expect(chatFacadeMock.history.loadConversationMessages).not.toHaveBeenCalled();
    }));

    it('should NOT call loadConversationMessages and should restoreFromMemory when returning to generating conversation from another chat', fakeAsync(() => {
      chatStateMock.currentConversation.set({
        conversationID: 'conv-other',
        messages: [createMockMsg({ sender: 'user', message: 'Other chat' })],
      });
      chatFacadeMock.history.generatingStates.set({ 'conv-123': true });

      component.ngOnInit();
      tick();

      expect(chatFacadeMock.history.loadConversationMessages).not.toHaveBeenCalled();
      expect(chatStateMock.restoreFromMemory).toHaveBeenCalledWith('conv-123');
    }));

    it('should NOT call loadConversationMessages for a new conversation created in this session with tempId', fakeAsync(() => {
      chatStateMock.currentConversation.set({
        conversationID: 'conv-123',
        tempId: 'temp-xyz-123',
        messages: [
          createMockMsg({ sender: 'user', message: 'First question' }),
        ],
      });
      chatStateMock.isChatGenerating.and.returnValue(false);

      component.ngOnInit();
      tick();

      expect(chatFacadeMock.history.loadConversationMessages).not.toHaveBeenCalled();
    }));

    it('should NOT call loadConversationMessages when last message is from user (sendMessage in flight)', fakeAsync(() => {
      chatStateMock.currentConversation.set({
        conversationID: 'conv-123',
        messages: [
          createMockMsg({ sender: 'user', message: 'Question just sent' }),
        ],
      });
      chatStateMock.isChatGenerating.and.returnValue(false);

      component.ngOnInit();
      tick();

      expect(chatFacadeMock.history.loadConversationMessages).not.toHaveBeenCalled();
    }));

    it('should forward pending attachments to sendMessage on new project conversation without duplicate greeting', fakeAsync(() => {
      routerMock.url = '/projects/1/conv-proj-101';
      sessionStorage.setItem('kai_is_new_project_conversation', 'true');
      sessionStorage.setItem('kai_pending_prompt', 'Analyze attached PDF');
      sessionStorage.setItem('kai_active_project_id', '1');

      const mockFiles = [
        { name: 'document.pdf', size: 2048, docId: 'doc-123', exceeds_threshold: false } as any,
      ];
      chatFacadeMock.attachment.pendingAttachments.set(mockFiles);

      (component as any).handleConversationId('conv-proj-101');
      tick(100);

      expect(chatStateMock.createConversation).toHaveBeenCalledWith(
        undefined,
        undefined,
        'conv-proj-101',
        true,
        '1',
      );
      expect(chatStateMock.sendMessage).toHaveBeenCalledWith('Analyze attached PDF', mockFiles);
      expect(chatFacadeMock.history.loadConversationMessages).not.toHaveBeenCalled();
    }));

    it('should call loadConversationMessages and save outgoing composer state when switching to another conversation even if previous chat was generating', fakeAsync(() => {
      const mockComposer = {
        saveCurrentState: jasmine.createSpy('saveCurrentState'),
      };
      component.promptComposer = mockComposer as any;

      chatStateMock.currentConversation.set({
        conversationID: 'conv-old',
        messages: [createMockMsg({ sender: 'user', message: 'Old chat message' })],
      });

      // Old conversation is generating, or streaming is enabled
      chatFacadeMock.history.generatingStates.set({ 'conv-old': true });
      chatFacadeMock.history.streaming.set(true);

      (component as any).handleConversationId('conv-new');
      tick(150);

      expect(mockComposer.saveCurrentState).toHaveBeenCalledWith('conv-old');
      expect(chatFacadeMock.history.loadConversationMessages).toHaveBeenCalledWith(
        'jane@example.com',
        'conv-new',
        jasmine.any(Function),
        jasmine.any(Function)
      );
    }));
  });
});

