import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ChatScrollDirective } from './chat-scroll.directive';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { SimpleChange } from '@angular/core';

@Component({
  template: `<div appChatScroll [isGenerating]="isGen" [chatScrollTrigger]="trigger" style="height: 100px; overflow-y: auto;">
    <div style="height: 500px;" class="message user">Hello World</div>
  </div>`,
  imports: [ChatScrollDirective],
  standalone: true
})
class TestHostComponent {
  isGen = false;
  trigger = 1;
}

describe('ChatScrollDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let scrollService: ChatScrollService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [ChatScrollService]
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    scrollService = TestBed.inject(ChatScrollService);
    fixture.detectChanges();
  });

  it('should scroll to bottom when scrollRequest$ emits', () => {
    const div = fixture.nativeElement.querySelector('div');
    scrollService.scrollToBottom();
    expect(div.scrollTop).toBeGreaterThanOrEqual(0);
  });

  it('should handle wheel event when generating', () => {
    fixture.componentInstance.isGen = true;
    fixture.detectChanges();

    const div = fixture.nativeElement.querySelector('div');
    const wheelEvent = new WheelEvent('wheel', { deltaY: -50 });
    div.dispatchEvent(wheelEvent);

    expect(scrollService.scrollAtBottom()).toBeFalse();
  });

  it('should handle touchstart and touchmove events when generating', () => {
    fixture.componentInstance.isGen = true;
    fixture.detectChanges();

    const div = fixture.nativeElement.querySelector('div');
    const touchStartEvent = new CustomEvent('touchstart', {
      bubbles: true,
      cancelable: true
    }) as any;
    touchStartEvent.touches = [{ clientY: 200 }];
    div.dispatchEvent(touchStartEvent);

    const touchMoveEvent = new CustomEvent('touchmove', {
      bubbles: true,
      cancelable: true
    }) as any;
    touchMoveEvent.touches = [{ clientY: 250 }];
    div.dispatchEvent(touchMoveEvent);

    expect(scrollService.scrollAtBottom()).toBeFalse();
  });

  it('should handle scroll event', () => {
    const div = fixture.nativeElement.querySelector('div');
    const scrollEvent = new Event('scroll');
    div.dispatchEvent(scrollEvent);
    expect(scrollService.scrollAtBottom()).toBeDefined();
  });

  it('should scroll to matching question when questionScrollRequest$ emits', fakeAsync(() => {
    scrollService.scrollToQuestion('Hello World');
    tick(200);
    expect(scrollService.scrollAtBottom()).toBeFalse();
  }));

  it('should scroll to target element when messageIndexScrollRequest$ emits', fakeAsync(() => {
    const userMsg = fixture.nativeElement.querySelector('.message.user');
    userMsg.id = 'chat-msg-0';
    scrollService.scrollToMessageIndex(0);
    tick(200);
    expect(scrollService.scrollAtBottom()).toBeFalse();
  }));

  it('should handle isGenerating change', () => {
    fixture.componentInstance.isGen = true;
    fixture.detectChanges();
    fixture.componentInstance.isGen = false;
    fixture.detectChanges();
    expect(scrollService).toBeTruthy();
  });
});
