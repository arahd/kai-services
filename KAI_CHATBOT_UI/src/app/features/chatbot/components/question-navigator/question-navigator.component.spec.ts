import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuestionNavigatorComponent } from './question-navigator.component';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatMessage } from '@shared/models';
import { signal } from '@angular/core';

describe('QuestionNavigatorComponent', () => {
  let component: QuestionNavigatorComponent;
  let fixture: ComponentFixture<QuestionNavigatorComponent>;
  let scrollService: jasmine.SpyObj<ChatScrollService>;
  let chatStateMock: { currentConversation: ReturnType<typeof signal<any>> };

  const mockMessages: ChatMessage[] = [
    {
      sender: 'user',
      message: 'First question about Angular',
      timestamp: new Date('2026-08-17T10:00:00Z'),
      responseType: 'text',
    },
    {
      sender: 'bot',
      message: 'First bot answer',
      timestamp: new Date('2026-08-17T10:01:00Z'),
      responseType: 'text',
    },
    {
      sender: 'user',
      message: 'Second question about RxJS',
      timestamp: new Date('2026-08-17T10:02:00Z'),
      responseType: 'text',
    },
    {
      sender: 'bot',
      message: 'Second bot answer',
      timestamp: new Date('2026-08-17T10:03:00Z'),
      responseType: 'text',
    },
    {
      sender: 'user',
      message: 'Third question about SCSS styling',
      timestamp: new Date('2026-08-17T10:04:00Z'),
      responseType: 'text',
    },
  ];

  beforeEach(async () => {
    chatStateMock = {
      currentConversation: signal({
        id: 1,
        conversationID: 'conv-123',
        messages: mockMessages,
      }),
    };

    const scrollSpy = jasmine.createSpyObj('ChatScrollService', [
      'scrollToBottom',
      'scrollToQuestion',
      'scrollToMessageIndex',
    ], {
      activeMessageIndex: signal<number | null>(null),
      scrollAtBottom: signal<boolean>(true),
    });

    await TestBed.configureTestingModule({
      imports: [QuestionNavigatorComponent],
      providers: [
        { provide: ChatStateService, useValue: chatStateMock },
        { provide: ChatScrollService, useValue: scrollSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuestionNavigatorComponent);
    component = fixture.componentInstance;
    scrollService = TestBed.inject(ChatScrollService) as jasmine.SpyObj<ChatScrollService>;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should compute questions list only from user messages', () => {
    const questions = component.questions();
    expect(questions.length).toBe(3);
    expect(questions[0].text).toBe('First question about Angular');
    expect(questions[0].qNumber).toBe(1);
    expect(questions[0].messageIndex).toBe(0);

    expect(questions[1].text).toBe('Second question about RxJS');
    expect(questions[1].qNumber).toBe(2);
    expect(questions[1].messageIndex).toBe(2);

    expect(questions[2].text).toBe('Third question about SCSS styling');
    expect(questions[2].qNumber).toBe(3);
    expect(questions[2].messageIndex).toBe(4);
  });

  it('should return shouldShow = true when >= 2 questions exist', () => {
    expect(component.shouldShow()).toBeTrue();
  });

  it('should return shouldShow = false when < 2 questions exist', () => {
    chatStateMock.currentConversation.set({
      id: 1,
      conversationID: 'conv-123',
      messages: [mockMessages[0], mockMessages[1]],
    });
    expect(component.shouldShow()).toBeFalse();
  });

  it('should filter questions when searchQuery is set', () => {
    component.searchQuery.set('rxjs');
    const filtered = component.filteredQuestions();
    expect(filtered.length).toBe(1);
    expect(filtered[0].text).toContain('RxJS');
  });

  it('should filter questions by question number (e.g. q1)', () => {
    component.searchQuery.set('q2');
    const filtered = component.filteredQuestions();
    expect(filtered.length).toBe(1);
    expect(filtered[0].qNumber).toBe(2);
  });

  it('should call scrollToMessageIndex when onQuestionClick is called', () => {
    component.onQuestionClick(2);
    expect(scrollService.scrollToMessageIndex).toHaveBeenCalledWith(2);
    expect(component.isMobileDrawerOpen()).toBeFalse();
  });

  it('should call scrollToBottom when onJumpToLatest is called', () => {
    component.onJumpToLatest();
    expect(scrollService.scrollToBottom).toHaveBeenCalled();
    expect(component.isMobileDrawerOpen()).toBeFalse();
  });

  it('should toggle collapse state when toggleCollapse is called', () => {
    expect(component.isCollapsed()).toBeTrue();
    component.toggleCollapse();
    expect(component.isCollapsed()).toBeFalse();
    component.toggleCollapse();
    expect(component.isCollapsed()).toBeTrue();
  });

  it('should toggle mobile drawer when toggleMobileDrawer is called', () => {
    expect(component.isMobileDrawerOpen()).toBeFalse();
    component.toggleMobileDrawer();
    expect(component.isMobileDrawerOpen()).toBeTrue();
  });

  it('should clear search query when clearSearch is called', () => {
    component.searchQuery.set('Angular');
    component.clearSearch();
    expect(component.searchQuery()).toBe('');
  });

  it('should format date properly in formatTime', () => {
    const d = new Date('2026-08-17T14:30:00');
    const formatted = component.formatTime(d);
    expect(formatted).toBeTruthy();
  });
});
