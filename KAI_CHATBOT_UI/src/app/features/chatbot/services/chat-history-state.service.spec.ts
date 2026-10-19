import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { ChatHistoryStateService } from './chat-history-state.service';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { SidenavCacheService } from '@features/sidenav/sidenav-cache.service';
import { ToastService } from '@core/services/toast.service';

describe('ChatHistoryStateService', () => {
  let service: ChatHistoryStateService;
  let mockChatService: any;
  let mockChatApi: any;
  let mockCacheService: any;
  let mockToastService: any;
  let mockRouter: any;

  let activeTempId$: Subject<string | null>;
  let draftConv$: Subject<any>;

  beforeEach(() => {
    sessionStorage.clear();
    activeTempId$ = new Subject<string | null>();
    draftConv$ = new Subject<any>();

    mockChatService = {
      activeTempId$,
      draftConv$,
      getConversationHistory: jasmine.createSpy('getConversationHistory').and.returnValue(of([
        { totalPages: 2 },
        { conversationID: 'c1', conversation: [{ question: 'Q1' }] },
        { conversationID: 'c2', conversation: [{ question: 'Q2' }], is_pinned: true }
      ])),
      getNewChatHistoryList: jasmine.createSpy('getNewChatHistoryList').and.returnValue(of([
        { conversationID: 'c1', conversation: [{ question: 'Q1' }] },
        { conversationID: 'c2', conversation: [{ question: 'Q2' }], is_pinned: true }
      ])),
      pinChat: jasmine.createSpy('pinChat').and.returnValue(of({})),
      deleteChat: jasmine.createSpy('deleteChat').and.returnValue(of({})),
      renameChat: jasmine.createSpy('renameChat').and.returnValue(of({})),
      searchChat: jasmine.createSpy('searchChat').and.returnValue(of({
        conversation_search: [{ conversationID: 'c1', title: 'Search Conv' }],
        question_search: [{ question: 'Search Q' }]
      }))
    };

    mockChatApi = {
      getNewChatHistoryConversation: jasmine.createSpy('getNewChatHistoryConversation').and.returnValue(of({
        conversationID: 'c1',
        conversation: [{ question: 'Q1', response: 'A1' }]
      })),
      getProjectChatHistoryConversation: jasmine.createSpy('getProjectChatHistoryConversation').and.returnValue(of({
        conversationID: 'c1',
        conversation: [{ question: 'Q1', response: 'A1' }]
      }))
    };

    mockCacheService = {
      set: jasmine.createSpy('set'),
    };

    mockToastService = {
      show: jasmine.createSpy('show'),
    };

    mockRouter = {
      url: '/chatbot',
    };

    TestBed.configureTestingModule({
      providers: [
        ChatHistoryStateService,
        { provide: ChatService, useValue: mockChatService },
        { provide: ChatApiService, useValue: mockChatApi },
        { provide: SidenavCacheService, useValue: mockCacheService },
        { provide: ToastService, useValue: mockToastService },
        { provide: Router, useValue: mockRouter }
      ]
    });

    service = TestBed.inject(ChatHistoryStateService);
  });

  it('should be created with default signals', () => {
    expect(service).toBeTruthy();
    expect(service.chats()).toEqual([]);
    expect(service.activeConversationID()).toBeNull();
    expect(service.activeTempId()).toBeNull();
    expect(service.currentPage()).toBe(1);
    expect(service.limit).toBe(20);
    expect(service.searchText()).toBe('');
    expect(service.searchResults()).toEqual([]);
  });

  it('should check if chatbot route is active', () => {
    expect(service.isChatbotActive()).toBeTrue();
    mockRouter.url = '/chatbot/c1';
    expect(service.isChatbotActive()).toBeTrue();
    mockRouter.url = '/projects';
    expect(service.isChatbotActive()).toBeTrue();
    mockRouter.url = '/projects/123';
    expect(service.isChatbotActive()).toBeTrue();
    mockRouter.url = '/hr-portal';
    expect(service.isChatbotActive()).toBeFalse();
  });

  it('should sync activeTempId from ChatService subscription', () => {
    activeTempId$.next('temp-777');
    expect(service.activeTempId()).toBe('temp-777');
  });

  it('should handle draft conversation updates', () => {
    draftConv$.next({
      conversationID: 'conv-new',
      title: 'New Chat Draft',
      messages: [
        { sender: 'user', message: 'User Question' },
        { sender: 'bot', message: 'Bot Answer' }
      ]
    });

    expect(service.chats().length).toBe(1);
    expect(service.chats()[0].conversationID).toBe('conv-new');
    expect(service.chats()[0].conversation[0].question).toBe('User Question');
    expect(service.chats()[0].conversation[0].response).toBe('Bot Answer');
  });

  it('should load history pages and sort pinned chats', () => {
    service.loadChats('user@test.com');

    expect(mockChatService.getNewChatHistoryList).toHaveBeenCalledWith(
      { user_string: 'user@test.com', bot_type: 'kumaran' },
      1,
      20
    );
    expect(service.chats().length).toBe(2);
    // Pin sorting puts pinned (c2) first
    expect(service.chats()[0].conversationID).toBe('c2');
    expect(mockCacheService.set).toHaveBeenCalled();
  });

  it('should handle pagination on loadChats for page 2', () => {
    mockChatService.getNewChatHistoryList.and.returnValue(of([
      { conversationID: 'c3', conversation: [{ question: 'Q3' }] }
    ]));
    service.loadChats('user@test.com', false, true, undefined, 2);
    expect(mockChatService.getNewChatHistoryList).toHaveBeenCalledWith(
      { user_string: 'user@test.com', bot_type: 'kumaran' },
      2,
      20
    );
  });

  it('should load conversation by conversation ID', () => {
    service.loadConversationByConversationID('user@test.com', 'c1');
    expect(mockChatApi.getNewChatHistoryConversation).toHaveBeenCalledWith(
      jasmine.objectContaining({ conversation_id: 'c1', user_string: 'user@test.com' })
    );
  });

  it('should skip API fetch in loadConversationByConversationID when conversation is generating', () => {
    service.generatingStates.set({ c1: true });
    const onChatSelectedSpy = jasmine.createSpy('onChatSelected');

    service.loadConversationByConversationID('user@test.com', 'c1', onChatSelectedSpy);
    expect(mockChatApi.getNewChatHistoryConversation).not.toHaveBeenCalled();
    expect(onChatSelectedSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ conversationID: 'c1', _fromMemory: true })
    );
  });

  it('should skip API fetch in loadConversationMessages when conversation is generating', () => {
    service.generatingStates.set({ c1: true });
    const onLoadedSpy = jasmine.createSpy('onLoaded');

    service.loadConversationMessages('user@test.com', 'c1', onLoadedSpy);
    expect(mockChatApi.getNewChatHistoryConversation).not.toHaveBeenCalled();
    expect(onLoadedSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ conversationID: 'c1', _fromMemory: true })
    );
  });

  it('should handle error when conversation lookup fails', () => {
    mockChatApi.getNewChatHistoryConversation.and.returnValue(throwError(() => new Error('API Fail')));
    const onInvalidSpy = jasmine.createSpy('onInvalid');

    service.loadConversationByConversationID('user@test.com', 'c1', undefined, onInvalidSpy);
    expect(onInvalidSpy).toHaveBeenCalled();
  });

  it('should pin and unpin chat', () => {
    service.chats.set([{ conversationID: 'c1', is_pinned: false }]);

    service.pinChat(0, 'user@test.com');
    expect(mockChatService.pinChat).toHaveBeenCalledWith('c1', undefined);
    expect(service.chats()[0].is_pinned).toBeTrue();
    expect(mockToastService.show).toHaveBeenCalledWith('Conversation pinned successfully', 'success');
  });

  it('should delete chat and notify on active deleted', () => {
    service.chats.set([{ conversationID: 'c1' }]);
    service.activeConversationID.set('c1');
    const onActiveDeletedSpy = jasmine.createSpy('onActiveDeleted');

    service.deleteChat(0, 'user@test.com', onActiveDeletedSpy);
    expect(mockChatService.deleteChat).toHaveBeenCalledWith({ conversationID: 'c1' });
    expect(service.chats().length).toBe(0);
    expect(onActiveDeletedSpy).toHaveBeenCalled();
    expect(mockToastService.show).toHaveBeenCalledWith('Conversation deleted successfully', 'success');
  });

  it('should rename chat', () => {
    service.chats.set([{ conversationID: 'c1', conversationName: 'Old' }]);

    service.renameChat(0, 'New Name', 'user@test.com');
    expect(mockChatService.renameChat).toHaveBeenCalledWith({ conversationID: 'c1', conversationName: 'New Name' });
    expect(service.chats()[0].conversationName).toBe('New Name');
    expect(mockToastService.show).toHaveBeenCalledWith('Conversation renamed successfully', 'success');
  });

  it('should search chat conversations and questions', () => {
    service.searchText.set('query test');
    service.searchChat('user@test.com');

    expect(mockChatService.searchChat).toHaveBeenCalledWith({ user_string: 'user@test.com', query: 'query test' });
    expect(service.searchResults().length).toBe(2);
    expect(service.searchResults()[0]._searchCategory).toBe('conversation');
    expect(service.searchResults()[1]._searchCategory).toBe('question');
  });

  it('should clear search results when search text is empty', () => {
    service.searchText.set('   ');
    service.searchChat('user@test.com');
    expect(service.searchResults()).toEqual([]);
  });
});
