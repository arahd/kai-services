import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ProjectDetailComponent } from './project-detail.component';
import { ProjectStateService } from '../../services/project-state.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';

import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { TokenService } from '@core/services/token.service';
import { ToastService } from '@core/services/toast.service';

describe('ProjectDetailComponent', () => {
  let component: ProjectDetailComponent;
  let fixture: ComponentFixture<ProjectDetailComponent>;

  const mockProjectState = {
    getOrFetchProject: jasmine.createSpy('getOrFetchProject').and.returnValue(
      Promise.resolve({
        project_id: 1,
        project_name: 'SharePoint',
      })
    ),
    loadProjectConversations: jasmine.createSpy('loadProjectConversations').and.returnValue(Promise.resolve()),
    loadProjectConversationMessages: jasmine.createSpy('loadProjectConversationMessages').and.returnValue(Promise.resolve({ conversation: [{ question: 'Q1', response: 'A1' }] })),
    newChat: jasmine.createSpy('newChat').and.returnValue(Promise.resolve({ conversationID: 'conv-123' })),
    projectConversations: signal([]),
    isLoadingConversations: signal(false),
  };

  const mockLayoutBridge = {
    models: signal([]),
  };

  const mockStorage = {
    getConversationId: jasmine.createSpy('getConversationId').and.returnValue('conv-123'),
    setConversationId: jasmine.createSpy('setConversationId'),
    setLastActiveConversationId: jasmine.createSpy('setLastActiveConversationId'),
    setForceNewChat: jasmine.createSpy('setForceNewChat'),
    removeForceNewChat: jasmine.createSpy('removeForceNewChat'),
  };

  const mockRouter = {
    navigate: jasmine.createSpy('navigate'),
  };

  const mockChatFacade = {
    attachment: {
      filePreviews: signal([]),
      pendingAttachments: signal([]),
      isFileUploading: signal(false),
      showLeftScroll: signal(false),
      showRightScroll: signal(false),
      uploadedCount: signal(0),
      getFileType: jasmine.createSpy('getFileType').and.returnValue('PDF'),
    },
    voice: {
      waveHeights: signal([]),
      isListening: signal(false),
      isVoiceConfirming: signal(false),
      tempTranscript: signal(''),
    },
    stopVoice: jasmine.createSpy('stopVoice'),
  };

  const mockChatState = {
    currentConversation: signal(null),
    isChatGenerating: jasmine.createSpy('isChatGenerating').and.returnValue(false),
    sendMessage: jasmine.createSpy('sendMessage'),
    createConversation: jasmine.createSpy('createConversation').and.returnValue({ conversationID: 'conv-123', messages: [] }),
  };

  const mockChatModel = {
    models: signal([{ model_id: 'gpt-4', label: 'GPT-4' }]),
    selectedModel: signal('gpt-4'),
    modelLocked: signal<boolean>(false),
    getSelectedModelLabel: jasmine.createSpy('getSelectedModelLabel').and.returnValue('GPT-5.1'),
    isImageUploadRestricted: jasmine.createSpy('isImageUploadRestricted').and.returnValue(false),
    isModelImageRestricted: jasmine.createSpy('isModelImageRestricted').and.returnValue(false),
    selectModel: jasmine.createSpy('selectModel').and.returnValue(true),
    loadModels: jasmine.createSpy('loadModels'),
    unlockModel: jasmine.createSpy('unlockModel'),
    lockModel: jasmine.createSpy('lockModel'),
  };

  const mockChatScroll = {
    scrollAtBottom: signal(true),
    scrollToBottom: jasmine.createSpy('scrollToBottom'),
  };

  const mockToast = {
    show: jasmine.createSpy('show'),
  };

  const mockChatApi = {
    deleteChat: jasmine.createSpy('deleteChat').and.returnValue(of({})),
    pinChat: jasmine.createSpy('pinChat').and.returnValue(of({})),
    renameChat: jasmine.createSpy('renameChat').and.returnValue(of({})),
    shareChat: jasmine.createSpy('shareChat').and.returnValue(of({ share_url: 'https://kai.ai/s/xyz123' })),
  };

  const mockTokenService = {
    getUserInfo: jasmine.createSpy('getUserInfo').and.returnValue({ email: 'test@kumaran.world' }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectDetailComponent],
      providers: [
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: SidenavLayoutBridgeService, useValue: mockLayoutBridge },
        { provide: SessionStorageService, useValue: mockStorage },
        { provide: Router, useValue: mockRouter },
        { provide: ChatFacadeService, useValue: mockChatFacade },
        { provide: ChatStateService, useValue: mockChatState },
        { provide: ChatModelService, useValue: mockChatModel },
        { provide: ChatScrollService, useValue: mockChatScroll },
        { provide: ToastService, useValue: mockToast },
        { provide: ChatApiService, useValue: mockChatApi },
        { provide: TokenService, useValue: mockTokenService },
        {
          provide: ActivatedRoute,
          useValue: { params: of({ projectId: '1' }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call chatModelService.loadModels on init', () => {
    expect(mockChatModel.loadModels).toHaveBeenCalledWith('test@kumaran.world');
  });

  it('should navigate back to projects list', () => {
    component.navigateBack();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/projects']);
  });

  it('should render app-prompt-composer inside .bottom-composer-wrapper', () => {
    const el: HTMLElement = fixture.nativeElement;
    const wrapper = el.querySelector('.bottom-composer-wrapper');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.querySelector('app-prompt-composer')).toBeTruthy();
  });

  it('should unlock model on init and newChat', () => {
    expect(mockChatModel.unlockModel).toHaveBeenCalled();
  });

  it('should synchronize model selection with chatModelService in selectModel', () => {
    component.selectModel({ value: 'gpt-4o', label: 'GPT-4o' });
    expect(component.selectedModelValue()).toBe('gpt-4o');
    expect(component.selectedModelLabel()).toBe('GPT-4o');
    expect(mockChatModel.selectModel).toHaveBeenCalledWith('gpt-4o', 'test@kumaran.world');
  });

  it('should call newChat to generate conversationId upon entering a project', async () => {
    await fixture.whenStable();
    expect(mockProjectState.newChat).toHaveBeenCalledWith(1);
  });

  it('should submit prompt and navigate to chatbot on composer message with initial conversationId', async () => {
    component.project.set({
      project_id: 1,
      project_name: 'SharePoint',
      username: 'user@kumaran.world',
      created_at: '2026-08-20T10:00:00',
    });
    component.initialConversationId.set('conv-123');
    await component.onComposerMessage({ message: 'How to configure SharePoint?' });

    expect(mockStorage.removeForceNewChat).toHaveBeenCalled();
    expect(mockStorage.setConversationId).toHaveBeenCalledWith('conv-123');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/projects', 1, 'conv-123']);
    expect(sessionStorage.getItem('kai_pending_prompt')).toBe('How to configure SharePoint?');
    expect(sessionStorage.getItem('kai_active_project_id')).toBe('1');
    expect(sessionStorage.getItem('kai_active_project_name')).toBe('SharePoint');
    const projectConv = JSON.parse(sessionStorage.getItem('kai_project_active_conv') || '{}');
    expect(projectConv.conversationID).toBe('conv-123');
    expect(mockChatState.createConversation).toHaveBeenCalledWith(undefined, undefined, 'conv-123', true, 1);
  });

  it('should preserve attachments when submitted from composer', async () => {
    component.project.set({
      project_id: 1,
      project_name: 'SharePoint',
      username: 'user@kumaran.world',
      created_at: '2026-08-20T10:00:00',
    });
    component.initialConversationId.set('conv-456');
    const mockFiles = [
      { name: 'requirements.pdf', size: 1024, docId: 'doc-999', exceeds_threshold: false } as any,
    ];

    await component.onComposerMessage({
      message: 'Analyze this document',
      files: mockFiles,
    });

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/projects', 1, 'conv-456']);
    expect(mockChatFacade.attachment.pendingAttachments()).toEqual(mockFiles);
    const stored = JSON.parse(sessionStorage.getItem('kai_pending_attachments') || '[]');
    expect(stored.length).toBe(1);
    expect(stored[0].docId).toBe('doc-999');
    expect(stored[0].name).toBe('requirements.pdf');
  });

  describe('Context Menu Actions with project_id', () => {
    beforeEach(() => {
      component.project.set({
        project_id: 42,
        project_name: 'Test Project',
        username: 'user@kumaran.world',
        created_at: '2026-08-20T10:00:00',
      });
      component.selectedConv.set({
        conversationID: 'conv-test-1',
        title: 'Project Discussion',
        is_pinned: false,
        created_at: '2026-08-20T10:00:00',
        project_id: 42,
      });
    });

    it('should call pinChat with conversationID and project_id on onMenuPin', () => {
      component.onMenuPin();
      expect(mockChatApi.pinChat).toHaveBeenCalledWith('conv-test-1', 42);
      expect(mockToast.show).toHaveBeenCalledWith('Conversation pinned successfully', 'success');
    });

    it('should toggle pin directly on togglePin click', () => {
      const conv = {
        conversationID: 'conv-test-1',
        title: 'Project Discussion',
        is_pinned: false,
        created_at: '2026-08-20T10:00:00',
        project_id: 42,
      };
      const mockEvent = new MouseEvent('click');
      spyOn(mockEvent, 'stopPropagation');

      component.togglePin(conv, mockEvent);
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockChatApi.pinChat).toHaveBeenCalledWith('conv-test-1', 42);
      expect(mockToast.show).toHaveBeenCalledWith('Conversation pinned successfully', 'success');
    });

    it('should open rename modal on onMenuRename and call renameChat with project_id on confirmRename', () => {
      component.onMenuRename();
      expect(component.showRenameModal()).toBeTrue();
      expect(component.renameValue()).toBe('Project Discussion');

      component.renameValue.set('Renamed Title');
      component.confirmRename();
      expect(mockChatApi.renameChat).toHaveBeenCalledWith({
        conversationID: 'conv-test-1',
        conversationName: 'Renamed Title',
        project_id: 42,
      });
      expect(mockToast.show).toHaveBeenCalledWith('Conversation renamed successfully', 'success');
      expect(component.showRenameModal()).toBeFalse();
    });

    it('should cancel rename and close modal on cancelRename', () => {
      component.onMenuRename();
      expect(component.showRenameModal()).toBeTrue();
      component.cancelRename();
      expect(component.showRenameModal()).toBeFalse();
      expect(component.convToRename()).toBeNull();
    });

    it('should open delete confirmation modal on onMenuDelete and call deleteChat on confirmDelete', () => {
      component.onMenuDelete();
      expect(component.showConfirm()).toBeTrue();
      expect(component.convToDelete()?.conversationID).toBe('conv-test-1');

      component.confirmDelete();
      expect(mockChatApi.deleteChat).toHaveBeenCalledWith({
        conversationID: 'conv-test-1',
        project_id: 42,
      });
      expect(mockToast.show).toHaveBeenCalledWith('Conversation deleted successfully', 'success');
      expect(component.showConfirm()).toBeFalse();
    });

    it('should cancel delete and close modal on cancelDelete', () => {
      component.onMenuDelete();
      expect(component.showConfirm()).toBeTrue();
      component.cancelDelete();
      expect(component.showConfirm()).toBeFalse();
      expect(component.convToDelete()).toBeNull();
    });

    it('should open share modal, load messages preview, and call shareChat on onMenuShare', () => {
      component.onMenuShare();
      expect(component.showShareModal()).toBeTrue();
      expect(mockProjectState.loadProjectConversationMessages).toHaveBeenCalledWith(42, 'conv-test-1');
      expect(mockChatApi.shareChat).toHaveBeenCalledWith(
        jasmine.objectContaining({
          conversationID: 'conv-test-1',
          bot_type: 'kumaran',
          user_string: 'test@kumaran.world',
          project_id: 42,
        })
      );
    });

    it('should copy share link on copyShareLink', fakeAsync(() => {
      spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
      component.shareUrl.set('https://kai.ai/chatbot/s/token123');
      component.copyShareLink();
      tick();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://kai.ai/chatbot/s/token123');
      expect(component.shareLinkCopied()).toBeTrue();
      expect(mockToast.show).toHaveBeenCalledWith('Link copied to clipboard!', 'success');
      tick(2000);
      expect(component.shareLinkCopied()).toBeFalse();
    }));

    it('should close share modal on closeShareModal', () => {
      component.showShareModal.set(true);
      component.shareUrl.set('some-url');
      component.closeShareModal();
      expect(component.showShareModal()).toBeFalse();
      expect(component.shareUrl()).toBe('');
    });
  });

  describe('Project Conversation History API triggering', () => {
    it('should call loadProjectConversationMessages when clicking on a conversation within a project', async () => {
      mockProjectState.loadProjectConversationMessages.calls.reset();
      component.project.set({
        project_id: 10,
        project_name: 'Alpha Project',
        username: 'test@kumaran.world',
        created_at: '2026-08-20T10:00:00',
      });

      const conv = {
        conversationID: 'conv-project-99',
        title: 'Project Discussion',
        is_pinned: false,
        created_at: '2026-08-20T10:00:00',
      };

      await component.openConversation(conv);

      expect(mockProjectState.loadProjectConversationMessages).toHaveBeenCalledWith(10, 'conv-project-99');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/projects', 10, 'conv-project-99']);
    });

    it('should NOT call loadProjectConversationMessages for a new chat', async () => {
      mockProjectState.loadProjectConversationMessages.calls.reset();
      component.project.set({
        project_id: 10,
        project_name: 'Alpha Project',
        username: 'test@kumaran.world',
        created_at: '2026-08-20T10:00:00',
      });

      await component.newChat(10);

      expect(mockProjectState.loadProjectConversationMessages).not.toHaveBeenCalled();
    });
  });
});
