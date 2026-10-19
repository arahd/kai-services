import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { ChatStateService } from './chat-state.service';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ToastService } from '@core/services/toast.service';
import { MessageFactoryService } from '@features/chatbot/services/message-factory.service';
import { ResponseMapperService } from '@features/chatbot/services/response-mapper.service';
import { StreamHandlerService } from '@features/chatbot/services/stream-handler.service';
import { MarkdownService } from '@shared/services/markdown.service';
import { ChatService } from '@features/chatbot/services/chat.service';

describe('ChatStateService', () => {
  let service: ChatStateService;
  let mockChatApi: any;
  let mockChatFacade: any;
  let mockChatModelService: any;
  let mockToastService: any;
  let mockMessageFactory: any;
  let mockResponseMapper: any;
  let mockStreamHandler: any;
  let mockMarkdownService: any;
  let mockChatService: any;

  beforeEach(() => {
    mockChatApi = {
      sendMessage: jasmine.createSpy('sendMessage').and.returnValue(of({ conversationID: 'conv-123', response: 'Hi there!' })),
      endChat: jasmine.createSpy('endChat').and.returnValue(of({})),
      chatSummarization: jasmine.createSpy('chatSummarization').and.returnValue(of({})),
      getSuggestions: jasmine.createSpy('getSuggestions').and.returnValue(of({ suggestions: [] }))
    };

    mockChatFacade = {
      token: {
        getUserInfo: jasmine.createSpy('getUserInfo').and.returnValue({ name: 'User Test', email: 'user@test.com' })
      },
      azureAd: {
        getUserInfoObservable: jasmine.createSpy('getUserInfoObservable').and.returnValue(of({ name: 'User Test', email: 'user@test.com' }))
      },
      history: {
        activeConversationID: signal<string | null>(null),
        activeTempId: signal<string | null>(null),
        generatingStates: jasmine.createSpy('generatingStates').and.returnValue({}),
        conversationStatuses: jasmine.createSpy('conversationStatuses').and.returnValue({}),
        streaming: signal<boolean>(false)
      },
      attachment: {
        isFileUploading: signal<boolean>(false),
        getExistingDocumentsData: jasmine.createSpy('getExistingDocumentsData').and.returnValue({
          existing_filenames: [],
          existing_doc_ids: [],
          existing_docs: [],
          existing_threshold: []
        }),
        addUploadedDocuments: jasmine.createSpy('addUploadedDocuments'),
        migrateUploadedDocsCache: jasmine.createSpy('migrateUploadedDocsCache')
      }
    };

    mockChatModelService = {
      loadModels: jasmine.createSpy('loadModels'),
      models: signal<any[]>([]),
      isLoadingModels: signal<boolean>(false),
      selectedModel: signal<string>('gpt-4o-mini'),
      modelLocked: signal<boolean>(false),
      lockModel: jasmine.createSpy('lockModel'),
      unlockModel: jasmine.createSpy('unlockModel'),
      setModelForConversation: jasmine.createSpy('setModelForConversation')
    };

    mockToastService = {
      show: jasmine.createSpy('show')
    };

    mockMessageFactory = {
      createUserMessage: jasmine.createSpy('createUserMessage').and.callFake((msg: string, atts: any[]) => ({
        sender: 'user',
        message: msg,
        attachments: atts
      })),
      createErrorMessage: jasmine.createSpy('createErrorMessage').and.returnValue({ sender: 'bot', message: 'Error', status: 'failed' }),
      createCancelledMessage: jasmine.createSpy('createCancelledMessage').and.returnValue({ sender: 'bot', message: 'Cancelled', status: 'cancelled' })
    };

    mockResponseMapper = {
      formatMessage: jasmine.createSpy('formatMessage').and.callFake((res: any) => Promise.resolve({ finalText: res.response || '', formattedMessage: `<p>${res.response}</p>` })),
      extractImages: jasmine.createSpy('extractImages').and.returnValue([]),
      extractDocuments: jasmine.createSpy('extractDocuments').and.returnValue([])
    };

    mockStreamHandler = {
      handleStreamingResponse: jasmine.createSpy('handleStreamingResponse')
    };

    mockMarkdownService = {
      formatMessage: jasmine.createSpy('formatMessage').and.callFake((txt: string) => Promise.resolve(`<p>${txt}</p>`))
    };

    mockChatService = {
      sendFirstQuestion: jasmine.createSpy('sendFirstQuestion'),
      updateDraftConversation: jasmine.createSpy('updateDraftConversation')
    };

    TestBed.configureTestingModule({
      providers: [
        ChatStateService,
        { provide: ChatApiService, useValue: mockChatApi },
        { provide: ChatFacadeService, useValue: mockChatFacade },
        { provide: ChatModelService, useValue: mockChatModelService },
        { provide: ToastService, useValue: mockToastService },
        { provide: MessageFactoryService, useValue: mockMessageFactory },
        { provide: ResponseMapperService, useValue: mockResponseMapper },
        { provide: StreamHandlerService, useValue: mockStreamHandler },
        { provide: MarkdownService, useValue: mockMarkdownService },
        { provide: ChatService, useValue: mockChatService }
      ]
    });

    sessionStorage.clear();
    service = TestBed.inject(ChatStateService);
  });

  afterEach(() => {
    service.destroyConversation();
    sessionStorage.clear();
  });

  it('should create and initialize conversation state', () => {
    expect(service).toBeTruthy();
    expect(service.currentConversation()).toBeNull();

    service.initConversation();
    expect(mockChatFacade.token.getUserInfo).toHaveBeenCalled();
    expect(mockChatModelService.loadModels).toHaveBeenCalledWith('user@test.com');
  });

  it('should create a new conversation reset states', () => {
    service.createConversation('Draft text', []);

    expect(mockChatModelService.unlockModel).toHaveBeenCalled();
    expect(service.currentConversation()).not.toBeNull();
    expect(mockChatApi.sendMessage).toHaveBeenCalled();
  });

  it('should not call sendMessage for initial greeting if existingConversationId is provided', () => {
    mockChatApi.sendMessage.calls.reset();
    const conv = service.createConversation(undefined, undefined, 'conv-prefetched-123', true, 10);

    expect(conv.conversationID).toBe('conv-prefetched-123');
    expect(conv.is_project_chat).toBeTrue();
    expect(conv.project_id).toBe(10);
    expect(mockChatApi.sendMessage).not.toHaveBeenCalled();
  });

  it('should send user message and dispatch to bot', fakeAsync(() => {
    service.createConversation();
    tick();

    service.sendMessage('Hello bot', []);
    tick();

    expect(mockMessageFactory.createUserMessage).toHaveBeenCalledWith('Hello bot', []);
    expect(mockChatService.sendFirstQuestion).toHaveBeenCalledWith('Hello bot');
    expect(mockChatModelService.lockModel).toHaveBeenCalled();
    expect(mockChatApi.sendMessage).toHaveBeenCalled();
  }));

  it('should include exceeds_threshold and uploaded_doc_ids in payload when attachments exist', fakeAsync(() => {
    service.createConversation();
    tick();

    const mockAttachments = [
      { name: 'doc1.pdf', docId: 'id-1', exceeds_threshold: true } as any,
      { name: 'doc2.pdf', docId: 'id-2', exceeds_threshold: false } as any
    ];

    service.sendMessage('Analyze docs', mockAttachments);
    tick();

    expect(mockChatApi.sendMessage).toHaveBeenCalledWith(jasmine.objectContaining({
      is_from_upload: true,
      uploaded_doc_ids: ['id-1', 'id-2'],
      uploaded_file_names: ['doc1.pdf', 'doc2.pdf'],
      exceeds_threshold: [true, false]
    }));
    expect(mockChatFacade.attachment.addUploadedDocuments).toHaveBeenCalled();
  }));

  it('should include existing_filenames, existing_doc_ids, and existing_threshold in payload for subsequent queries', fakeAsync(() => {
    mockChatFacade.attachment.getExistingDocumentsData.and.returnValue({
      existing_filenames: ['prev1.pdf', 'prev2.pdf'],
      existing_doc_ids: ['id-prev-1', 'id-prev-2'],
      existing_docs: ['id-prev-1', 'id-prev-2'],
      existing_threshold: [false, true]
    });

    service.createConversation();
    tick();

    service.sendMessage('Follow up question', []);
    tick();

    expect(mockChatApi.sendMessage).toHaveBeenCalledWith(jasmine.objectContaining({
      query: 'Follow up question',
      is_from_upload: false,
      existing_filenames: ['prev1.pdf', 'prev2.pdf'],
      existing_doc_ids: ['id-prev-1', 'id-prev-2'],
      existing_threshold: [false, true]
    }));
  }));

  it('should include both new uploads and existing documents in payload when uploading new files in existing chat', fakeAsync(() => {
    mockChatFacade.attachment.getExistingDocumentsData.and.returnValue({
      existing_filenames: ['existing.pdf'],
      existing_doc_ids: ['exist-id'],
      existing_docs: ['exist-id'],
      existing_threshold: [false]
    });

    service.createConversation();
    tick();

    const newAttachments = [
      { name: 'new.pdf', docId: 'new-id', exceeds_threshold: true } as any
    ];

    service.sendMessage('Compare docs', newAttachments);
    tick();

    expect(mockChatApi.sendMessage).toHaveBeenCalledWith(jasmine.objectContaining({
      query: 'Compare docs',
      is_from_upload: true,
      uploaded_doc_ids: ['new-id'],
      uploaded_file_names: ['new.pdf'],
      exceeds_threshold: [true],
      existing_filenames: ['existing.pdf'],
      existing_doc_ids: ['exist-id'],
      existing_threshold: [false]
    }));
  }));

  it('should check if skeleton loader should be displayed', () => {
    expect(service.shouldShowSkeleton(null)).toBeFalse();

    const conv = { id: 1, conversationID: 'conv-101', messages: [{ sender: 'user', message: 'Question' }] };
    mockChatFacade.history.generatingStates()['conv-101'] = true;

    expect(service.shouldShowSkeleton(conv as any)).toBeTrue();
  });

  it('should cancel active generation and append cancelled message', () => {
    service.createConversation();
    service.cancelGeneration();

    expect(mockMessageFactory.createCancelledMessage).toHaveBeenCalled();
    expect(service.currentConversation()?.messages.length).toBeGreaterThan(0);
  });

  it('should compute formatted elapsed loading time correctly', () => {
    service.loadingElapsedSeconds.set(0);
    expect(service.loadingElapsedFormatted()).toBe('0s');

    service.loadingElapsedSeconds.set(15);
    expect(service.loadingElapsedFormatted()).toBe('15s');

    service.loadingElapsedSeconds.set(65);
    expect(service.loadingElapsedFormatted()).toBe('1:05');

    service.loadingElapsedSeconds.set(120);
    expect(service.loadingElapsedFormatted()).toBe('2:00');
  });

  it('should return false from isChatGenerating when last message is a failed bot message', () => {
    const conv = {
      id: 123,
      conversationID: 'conv-test-fail',
      messages: [
        { sender: 'user', message: 'Hello' },
        { sender: 'bot', message: 'Failed to respond', status: 'failed', isPlaceholder: false },
      ],
    };
    mockChatFacade.history.generatingStates()['conv-test-fail'] = true;
    service.currentConversation.set(conv as any);

    const isGenerating = service.isChatGenerating('conv-test-fail');
    expect(isGenerating).toBeFalse();
    expect(mockChatFacade.history.generatingStates()['conv-test-fail']).toBeFalse();
  });

  it('should retryMessage by removing only the failed bot message and keeping user query', () => {
    const conv = {
      id: 123,
      conversationID: 'conv-retry-test',
      messages: [
        { sender: 'user', message: 'Original query', attachments: [] },
        { sender: 'bot', message: 'Error', status: 'failed', isPlaceholder: false },
      ],
    };
    service.currentConversation.set(conv as any);
    spyOn(service as any, 'sendToBot');

    service.retryMessage(1);

    expect((service as any).sendToBot).toHaveBeenCalledWith('Original query', []);
    // Only the failed bot message should be removed; the user query remains
    expect(service.currentConversation()?.messages.length).toBe(1);
    expect(service.currentConversation()?.messages[0].message).toBe('Original query');
  });

  it('should not retry if the failed message is not the latest message in thread', () => {
    const conv = {
      id: 123,
      conversationID: 'conv-retry-test',
      messages: [
        { sender: 'user', message: 'First query' },
        { sender: 'bot', message: 'Failed response', status: 'failed', isPlaceholder: false },
        { sender: 'user', message: 'Second query' },
        { sender: 'bot', message: 'Second response', status: 'completed', isPlaceholder: false },
      ],
    };
    service.currentConversation.set(conv as any);
    spyOn(service as any, 'sendToBot');

    service.retryMessage(1);

    expect((service as any).sendToBot).not.toHaveBeenCalled();
    expect(service.currentConversation()?.messages.length).toBe(4);
  });

  it('should clear canRetry on previous bot messages when a new message is sent', () => {
    const conv = {
      id: 123,
      conversationID: 'conv-retry-clear',
      messages: [
        { sender: 'user', message: 'Q1' },
        { sender: 'bot', message: 'Response generation canceled.', status: 'failed', isPlaceholder: false, canRetry: true },
      ],
    };
    service.currentConversation.set(conv as any);
    spyOn(service as any, 'sendToBot');

    service.sendMessage('Q2', []);

    const prevBotMsg = service.currentConversation()?.messages[1];
    expect(prevBotMsg?.canRetry).toBeFalse();
  });
});
