import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { signal } from '@angular/core';

import { ChatbotWelcomeComponent } from './chatbot-welcome.component';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';

// ── Stub Child Components ──────────────────────────────────────────────

@Component({
  selector: 'app-welcome-state',
  standalone: true,
  template: '<ng-content></ng-content>',
})
class WelcomeStateStubComponent {
  @Input() userName = '';
  @Input() avatarUrl: any = null;
  @Input() cards: any[] = [];
  @Output() cardClicked = new EventEmitter<any>();
  @Output() categoryPillClicked = new EventEmitter<any>();
}

@Component({
  selector: 'app-prompt-composer',
  standalone: true,
  template: '',
})
class PromptComposerStubComponent {
  @Input() isWelcomePage = false;
  setInputMessage = jasmine.createSpy('setInputMessage');
  focus = jasmine.createSpy('focus');
  autoResize = jasmine.createSpy('autoResize');
  sendMessage = jasmine.createSpy('sendMessage');
}

// ── Test Suite ─────────────────────────────────────────────────────────

describe('ChatbotWelcomeComponent', () => {
  let component: ChatbotWelcomeComponent;
  let fixture: ComponentFixture<ChatbotWelcomeComponent>;

  let chatStateMock: any;
  let chatFacadeMock: any;
  let routerMock: any;
  let chatModelMock: any;
  let layoutBridgeMock: any;

  beforeEach(async () => {
    sessionStorage.clear();

    chatStateMock = {
      userInfo: {
        name: 'John Doe',
        avatar: 'avatar.png',
        email: 'john@example.com',
      },
      currentConversation: signal<any>(null),
      createConversation: jasmine.createSpy('createConversation').and.returnValue({
        id: 1,
        conversationID: 'conv-1',
        messages: [],
      }),
    };

    chatFacadeMock = {
      history: {
        generatingStates: signal<{ [key: string]: boolean }>({}),
      },
    };

    routerMock = {
      navigate: jasmine.createSpy('navigate'),
      url: '/chatbot',
    };

    chatModelMock = {
      selectedModel: signal('gpt-5.1'),
      getSelectedModelLabel: jasmine.createSpy('getSelectedModelLabel').and.returnValue('GPT-5.1'),
      models: signal([{ value: 'gpt-5.1', label: 'GPT-5.1' }]),
      selectModel: jasmine.createSpy('selectModel').and.returnValue(true),
    };

    layoutBridgeMock = {
      openMobileSidebar: jasmine.createSpy('openMobileSidebar'),
      closeMobileSidebar: jasmine.createSpy('closeMobileSidebar'),
      mobileSidebarOpen: signal(false),
    };

    await TestBed.configureTestingModule({
      imports: [ChatbotWelcomeComponent],
      providers: [
        { provide: ChatStateService, useValue: chatStateMock },
        { provide: ChatFacadeService, useValue: chatFacadeMock },
        { provide: Router, useValue: routerMock },
        { provide: ChatModelService, useValue: chatModelMock },
        { provide: SidenavLayoutBridgeService, useValue: layoutBridgeMock },
      ],
    })
      .overrideComponent(ChatbotWelcomeComponent, {
        set: {
          imports: [CommonModule, WelcomeStateStubComponent, PromptComposerStubComponent],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatbotWelcomeComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize defaultCards with 3 cards', () => {
    expect(component.defaultCards.length).toBe(3);
    expect(component.currentCards.length).toBe(3);
    expect(component.defaultCards[0].title).toBe('Image Generator');
    expect(component.defaultCards[1].title).toBe('Write Copy');
    expect(component.defaultCards[2].title).toBe('Write Code');
  });

  describe('ngOnInit', () => {
    it('should create a new conversation if currentConversation is null', () => {
      chatStateMock.currentConversation.set(null);
      component.ngOnInit();
      expect(chatStateMock.createConversation).toHaveBeenCalled();
    });

    it('should create a new conversation if currentConversation has messages', () => {
      chatStateMock.currentConversation.set({
        id: 1,
        messages: [{ sender: 'user', message: 'Hello' }],
      });
      component.ngOnInit();
      expect(chatStateMock.createConversation).toHaveBeenCalled();
    });

    it('should not create a new conversation if currentConversation exists and has 0 messages', () => {
      chatStateMock.currentConversation.set({
        id: 1,
        messages: [],
      });
      component.ngOnInit();
      expect(chatStateMock.createConversation).not.toHaveBeenCalled();
    });

    it('should clear project session keys on init', () => {
      sessionStorage.setItem('kai_active_project_id', '123');
      sessionStorage.setItem('kai_active_project_name', 'Test Project');
      sessionStorage.setItem('kai_pending_project_id', '456');
      sessionStorage.setItem('kai_pending_project_name', 'Pending Project');
      sessionStorage.setItem('kai_project_active_conv', '{"id":1}');
      sessionStorage.setItem('kai_active_project_conversation_id', 'conv-abc');

      component.ngOnInit();

      expect(sessionStorage.getItem('kai_active_project_id')).toBeNull();
      expect(sessionStorage.getItem('kai_active_project_name')).toBeNull();
      expect(sessionStorage.getItem('kai_pending_project_id')).toBeNull();
      expect(sessionStorage.getItem('kai_pending_project_name')).toBeNull();
      expect(sessionStorage.getItem('kai_project_active_conv')).toBeNull();
      expect(sessionStorage.getItem('kai_active_project_conversation_id')).toBeNull();
    });
  });

  describe('Navigation Effect', () => {
    it('should navigate to conversation page when a message is added', () => {
      fixture.detectChanges();

      chatStateMock.currentConversation.set({
        id: 10,
        conversationID: 'conv-nav-123',
        messages: [{ sender: 'user', message: 'Hi there' }],
      });

      fixture.detectChanges();

      expect(routerMock.navigate).toHaveBeenCalledWith(
        ['/chatbot', 'conv-nav-123'],
        { replaceUrl: true }
      );
    });

    it('should fallback to tempId or id string if conversationID is absent', () => {
      fixture.detectChanges();

      chatStateMock.currentConversation.set({
        id: 42,
        tempId: 'temp-xyz',
        messages: [{ sender: 'user', message: 'Hi' }],
      });

      fixture.detectChanges();

      expect(routerMock.navigate).toHaveBeenCalledWith(
        ['/chatbot', 'temp-xyz'],
        { replaceUrl: true }
      );
    });
  });

  function createMockComposer() {
    return {
      autoResize: jasmine.createSpy('autoResize'),
      setInputMessage: jasmine.createSpy('setInputMessage'),
      focus: jasmine.createSpy('focus'),
      sendMessage: jasmine.createSpy('sendMessage'),
    };
  }

  describe('handleCardClick', () => {
    it('should set input message and focus composer when card is clicked', fakeAsync(() => {
      fixture.detectChanges();
      const mockComposer = createMockComposer();
      component.promptComposer = mockComposer as any;

      const card = { title: 'Test', prompt: 'Write a poem' };
      component.handleCardClick(card);

      expect(mockComposer.setInputMessage).toHaveBeenCalledWith('Write a poem');
      tick();
      expect(mockComposer.focus).toHaveBeenCalled();
    }));

    it('should handle card without prompt gracefully', fakeAsync(() => {
      fixture.detectChanges();
      const mockComposer = createMockComposer();
      component.promptComposer = mockComposer as any;

      component.handleCardClick(null);
      expect(mockComposer.setInputMessage).toHaveBeenCalledWith('');
      tick();
      expect(mockComposer.focus).toHaveBeenCalled();
    }));
  });

  describe('ngAfterViewInit', () => {
    it('should call autoResize on composer', fakeAsync(() => {
      fixture.detectChanges();
      const mockComposer = createMockComposer();
      component.promptComposer = mockComposer as any;

      component.ngAfterViewInit();
      tick();

      expect(mockComposer.autoResize).toHaveBeenCalled();
    }));

    it('should handle pending prompt from sessionStorage', fakeAsync(() => {
      fixture.detectChanges();

      const mockComposer = createMockComposer();
      component.promptComposer = mockComposer as any;

      sessionStorage.setItem('kai_pending_prompt', 'Explain quantum computing');
      component.ngAfterViewInit();

      expect(mockComposer.setInputMessage).toHaveBeenCalledWith('Explain quantum computing');
      expect(sessionStorage.getItem('kai_pending_prompt')).toBeNull();

      tick(100);
      expect(mockComposer.focus).toHaveBeenCalled();
      expect(mockComposer.autoResize).toHaveBeenCalled();
      expect(mockComposer.sendMessage).toHaveBeenCalled();
    }));
  });
});

