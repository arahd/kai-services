import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SharedChatComponent } from '@features/shared-chat/shared-chat.component';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('SharedChatComponent', () => {
  let component: SharedChatComponent;
  let fixture: ComponentFixture<SharedChatComponent>;
  let paramsSubject: BehaviorSubject<any>;

  const mockSharedData = {
    conversationName: 'Test Shared Chat',
    messages: [
      { sender: 'user', message: 'Hello bot' },
      { sender: 'bot', message: 'Hello user. Here is some **bold** text and `code`.' }
    ]
  };

  let mockChatService: any;
  let mockRouter: any;

  beforeEach(async () => {
    mockChatService = {
      getSharedChat: jasmine.createSpy('getSharedChat').and.returnValue(of(mockSharedData))
    };

    mockRouter = {
      navigate: jasmine.createSpy('navigate')
    };

    paramsSubject = new BehaviorSubject<any>({ token: 'mock-token' });

    await TestBed.configureTestingModule({
      imports: [SharedChatComponent, NoopAnimationsModule],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            params: paramsSubject.asObservable()
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SharedChatComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should load shared chat details when token is provided', fakeAsync(() => {
    fixture.detectChanges();
    tick(); // Wait for markdown async parsing

    expect(mockChatService.getSharedChat).toHaveBeenCalledWith('mock-token');
    expect(component.conversationTitle).toBe('Test Shared Chat');
    expect(component.messages.length).toBe(2);
    expect(component.messages[0].sender).toBe('user');
    expect(component.messages[1].sender).toBe('bot');
    expect(component.messages[1].html).toContain('<strong>bold</strong>');
    expect(component.messages[1].html).toContain('<code>code</code>');
    expect(component.loading).toBeFalse();
  }));

  it('should show error if token is missing in route params', () => {
    paramsSubject.next({ token: '' });
    fixture.detectChanges();

    expect(component.error).toBeTrue();
    expect(component.errorMessage).toBe('Invalid share link.');
    expect(component.loading).toBeFalse();
  });

  it('should handle API empty/null response in loadSharedChat', () => {
    component.token = 'mock-token';
    mockChatService.getSharedChat.and.returnValue(of(null));
    component.loadSharedChat();
    fixture.detectChanges();

    expect(component.error).toBeTrue();
    expect(component.errorMessage).toBe('No data found for this shared conversation.');
    expect(component.loading).toBeFalse();
  });

  it('should handle API errors in loadSharedChat', () => {
    component.token = 'mock-token';
    mockChatService.getSharedChat.and.returnValue(throwError(() => new Error('API Error')));
    component.loadSharedChat();
    fixture.detectChanges();

    expect(component.error).toBeTrue();
    expect(component.errorMessage).toBe('Failed to load shared conversation. It may have expired or been deleted.');
    expect(component.loading).toBeFalse();
  });

  describe('normalizeMessages', () => {
    it('should normalize array data', () => {
      const data = [
        { role: 'user', message: 'Hello' },
        { role: 'bot', message: 'Hi' }
      ];
      const result = component.normalizeMessages(data);
      expect(result.length).toBe(2);
      expect(result[0].sender).toBe('user');
      expect(result[1].sender).toBe('bot');
    });

    it('should normalize object with messages array', () => {
      const data = {
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };
      const result = component.normalizeMessages(data);
      expect(result.length).toBe(1);
      expect(result[0].message).toBe('Hello');
    });

    it('should normalize object with conversation array', () => {
      const data = {
        conversation: [
          { question: 'User Q', answer: 'Bot A' }
        ]
      };
      const result = component.normalizeMessages(data);
      expect(result.length).toBe(2);
      expect(result[0].sender).toBe('user');
      expect(result[0].message).toBe('User Q');
      expect(result[1].sender).toBe('bot');
      expect(result[1].message).toBe('Bot A');
    });

    it('should return empty array for invalid inputs', () => {
      expect(component.normalizeMessages(null)).toEqual([]);
      expect(component.normalizeMessages(undefined)).toEqual([]);
      expect(component.normalizeMessages('invalid')).toEqual([]);
    });
  });
});
