import { TestBed } from '@angular/core/testing';
import { ChatScrollService } from './chat-scroll.service';

describe('ChatScrollService', () => {
  let service: ChatScrollService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ChatScrollService]
    });
    service = TestBed.inject(ChatScrollService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should default scrollAtBottom to true', () => {
    expect(service.scrollAtBottom()).toBeTrue();
  });

  it('should emit on scrollRequest$ when scrollToBottom is called', (done) => {
    service.scrollRequest$.subscribe(() => {
      expect(service.scrollAtBottom()).toBeTrue();
      done();
    });
    service.scrollToBottom();
  });

  it('should set scrollAtBottom to true when scrollToBottom is called', () => {
    service.scrollAtBottom.set(false);
    expect(service.scrollAtBottom()).toBeFalse();
    service.scrollToBottom();
    expect(service.scrollAtBottom()).toBeTrue();
  });

  it('should emit question on questionScrollRequest$ when scrollToQuestion is called', (done) => {
    service.questionScrollRequest$.subscribe((question) => {
      expect(question).toBe('What is the weather?');
      done();
    });
    service.scrollToQuestion('What is the weather?');
  });

  it('should handle multiple scrollToBottom calls', () => {
    let callCount = 0;
    const sub = service.scrollRequest$.subscribe(() => callCount++);

    service.scrollToBottom();
    service.scrollToBottom();
    service.scrollToBottom();

    expect(callCount).toBe(3);
    sub.unsubscribe();
  });

  it('should handle empty string scrollToQuestion', (done) => {
    service.questionScrollRequest$.subscribe((question) => {
      expect(question).toBe('');
      done();
    });
    service.scrollToQuestion('');
  });

  it('should emit message index and set activeMessageIndex when scrollToMessageIndex is called', (done) => {
    service.messageIndexScrollRequest$.subscribe((index) => {
      expect(index).toBe(4);
      expect(service.activeMessageIndex()).toBe(4);
      done();
    });
    service.scrollToMessageIndex(4);
  });
});
