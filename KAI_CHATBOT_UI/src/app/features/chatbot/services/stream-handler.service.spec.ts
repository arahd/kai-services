import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { StreamHandlerService } from './stream-handler.service';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { MessageFactoryService } from '@features/chatbot/services/message-factory.service';
import { ResponseMapperService } from '@features/chatbot/services/response-mapper.service';
import { MarkdownService } from '@shared/services/markdown.service';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { Conversation } from '@shared/models';

describe('StreamHandlerService', () => {
  let service: StreamHandlerService;
  let mockChatApi: any;
  let mockMessageFactory: any;
  let mockResponseMapper: any;
  let mockMarkdownService: any;
  let mockChatFacade: any;
  let mockChatModelService: any;
  let mockChatState: any;

  let streamSubject: Subject<string>;

  beforeEach(() => {
    streamSubject = new Subject<string>();

    mockChatApi = {
      sendMessageStream: jasmine.createSpy('sendMessageStream').and.returnValue(streamSubject.asObservable())
    };

    mockMessageFactory = {
      createBotPlaceholder: jasmine.createSpy('createBotPlaceholder').and.callFake(() => ({
        sender: 'bot',
        message: '',
        html: '',
        status: 'pending',
        isPlaceholder: true
      })),
      createErrorMessage: jasmine.createSpy('createErrorMessage').and.callFake((msg?: string) => ({
        sender: 'bot',
        message: msg || 'Error occurred',
        html: `<p>${msg || 'Error occurred'}</p>`,
        status: 'failed'
      }))
    };

    mockResponseMapper = {
      cleanSystemTags: jasmine.createSpy('cleanSystemTags').and.callFake((t: string) => t),
      isMappedResponseType: jasmine.createSpy('isMappedResponseType').and.callFake((t: string) => t === 'PII'),
      getMappedResponseText: jasmine.createSpy('getMappedResponseText').and.returnValue('PII text block'),
      extractImages: jasmine.createSpy('extractImages').and.returnValue([]),
      extractDocuments: jasmine.createSpy('extractDocuments').and.returnValue([])
    };

    mockMarkdownService = {
      formatMessage: jasmine.createSpy('formatMessage').and.callFake((t: string) => Promise.resolve(`<p>${t}</p>`))
    };

    mockChatFacade = {
      history: {
        generatingStates: jasmine.createSpy('generatingStates').and.returnValue({}),
        conversationStatuses: jasmine.createSpy('conversationStatuses').and.returnValue({}),
        activeConversationID: { set: jasmine.createSpy('set') }
      }
    };

    mockChatModelService = {
      selectedModel: jasmine.createSpy('selectedModel').and.returnValue('gpt-4o-mini'),
      setModelForConversation: jasmine.createSpy('setModelForConversation')
    };

    mockChatState = {
      showSessionExpiredPopup: { set: jasmine.createSpy('set') },
      showLimitPopup: { set: jasmine.createSpy('set') }
    };

    TestBed.configureTestingModule({
      providers: [
        StreamHandlerService,
        { provide: ChatApiService, useValue: mockChatApi },
        { provide: MessageFactoryService, useValue: mockMessageFactory },
        { provide: ResponseMapperService, useValue: mockResponseMapper },
        { provide: MarkdownService, useValue: mockMarkdownService },
        { provide: ChatFacadeService, useValue: mockChatFacade },
        { provide: ChatModelService, useValue: mockChatModelService },
        { provide: ChatStateService, useValue: mockChatState }
      ]
    });

    service = TestBed.inject(StreamHandlerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should process mapped response type (e.g. PII) stream line', () => {
    const targetConv: Conversation = { id: 1, conversationID: 'c1', title: 'Test', messages: [] };
    const activeRequestIds = {};
    const currentSubs = {};
    const store = new Map<string, Conversation>();
    const updateSpy = jasmine.createSpy('update');
    const completeSpy = jasmine.createSpy('complete');

    service.handleStreamingResponse(
      { model: 'gpt-4' },
      targetConv,
      'c1',
      activeRequestIds,
      currentSubs,
      store,
      updateSpy,
      completeSpy,
      () => true
    );

    const streamLine = 'data: ' + JSON.stringify({ responseType: 'PII', conversationID: 'c1' }) + '\n';
    streamSubject.next(streamLine);

    expect(targetConv.messages.length).toBe(1);
    expect(targetConv.messages[0].message).toBe('PII text block');
    expect(targetConv.messages[0].status).toBe('completed');
  });

  it('should process streaming text chunks', () => {
    const targetConv: Conversation = { id: 2, conversationID: 'c2', title: 'Test Stream', messages: [] };
    const activeRequestIds = {};
    const currentSubs = {};
    const store = new Map<string, Conversation>();
    const updateSpy = jasmine.createSpy('update');
    const completeSpy = jasmine.createSpy('complete');

    service.handleStreamingResponse(
      { model: 'gpt-4o' },
      targetConv,
      'c2',
      activeRequestIds,
      currentSubs,
      store,
      updateSpy,
      completeSpy,
      () => true
    );

    const chunk1 = 'data: ' + JSON.stringify({ content: 'Hello ' }) + '\n';
    const chunk2 = 'data: ' + JSON.stringify({ content: 'world!', finish_reason: 'stop' }) + '\n';

    streamSubject.next(chunk1);
    streamSubject.next(chunk2);
    streamSubject.complete();

    expect(mockChatApi.sendMessageStream).toHaveBeenCalled();
  });

  it('should handle session expired 419 error during streaming', () => {
    const targetConv: Conversation = { id: 3, conversationID: 'c3', title: 'Test Expired', messages: [] };
    const activeRequestIds = {};
    const currentSubs = {};
    const store = new Map<string, Conversation>();
    const updateSpy = jasmine.createSpy('update');
    const completeSpy = jasmine.createSpy('complete');

    service.handleStreamingResponse(
      {},
      targetConv,
      'c3',
      activeRequestIds,
      currentSubs,
      store,
      updateSpy,
      completeSpy,
      () => true
    );

    streamSubject.error({ status: 419 });

    expect(mockChatState.showSessionExpiredPopup.set).toHaveBeenCalledWith(true);
  });

  it('should handle limit exceeded 519 error during streaming', () => {
    const targetConv: Conversation = { id: 4, conversationID: 'c4', title: 'Test Limit', messages: [] };
    const activeRequestIds = {};
    const currentSubs = {};
    const store = new Map<string, Conversation>();
    const updateSpy = jasmine.createSpy('update');
    const completeSpy = jasmine.createSpy('complete');

    service.handleStreamingResponse(
      {},
      targetConv,
      'c4',
      activeRequestIds,
      currentSubs,
      store,
      updateSpy,
      completeSpy,
      () => true
    );

    streamSubject.error({ status: 519 });

    expect(mockChatState.showLimitPopup.set).toHaveBeenCalledWith(true);
  });
});
