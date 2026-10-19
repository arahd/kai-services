import { Directive, ElementRef, HostListener, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { Subscription } from 'rxjs';

@Directive({
  selector: '[appChatScroll]',
  standalone: true,
})
export class ChatScrollDirective implements OnInit, OnChanges, OnDestroy {
  @Input() isGenerating = false;
  @Input() chatScrollTrigger: any; // Triggers evaluation when messages change

  private readonly chatScrollService = inject(ChatScrollService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private scrollTimer?: any;
  private programmaticTargetIndex: number | null = null;
  private programmaticScrollTimer?: any;
  private subscriptions = new Subscription();

  ngOnInit() {
    this.chatScrollService.scrollAtBottom.set(true);
    this.chatScrollService.activeMessageIndex.set(null);

    this.subscriptions.add(
      this.chatScrollService.scrollRequest$.subscribe(() => {
        this.scrollToBottom();
      })
    );

    this.subscriptions.add(
      this.chatScrollService.questionScrollRequest$.subscribe((question) => {
        this.scrollToQuestion(question);
      })
    );

    this.subscriptions.add(
      this.chatScrollService.messageIndexScrollRequest$.subscribe((index) => {
        this.scrollToMessageIndex(index);
      })
    );
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['chatScrollTrigger']) {
      if (this.isGenerating && this.chatScrollService.scrollAtBottom()) {
        this.startTemporaryScroll();
      } else {
        setTimeout(() => {
          const el = this.el.nativeElement;
          if (el.scrollHeight <= el.clientHeight + 5) {
            this.chatScrollService.scrollAtBottom.set(true);
          }
        }, 80);
      }
    }

    // Start/stop MutationObserver when generation state changes
    if (changes['isGenerating']) {
      if (this.isGenerating) {
        this.userScrolledAway = false;
        this.startMutationObserver();
      } else {
        this.stopMutationObserver();
        this.userScrolledAway = false;
        if (this.chatScrollService.scrollAtBottom()) {
          this.scrollToBottom();
        }
        setTimeout(() => {
          const el = this.el.nativeElement;
          if (el.scrollHeight <= el.clientHeight + 5) {
            this.chatScrollService.scrollAtBottom.set(true);
          }
        }, 80);
      }
    }
  }

  ngOnDestroy() {
    this.chatScrollService.scrollAtBottom.set(true);
    this.chatScrollService.activeMessageIndex.set(null);
    this.clearProgrammaticScroll();
    this.subscriptions.unsubscribe();
    this.stopMutationObserver();
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    if (this.programmaticScrollTimer) {
      clearTimeout(this.programmaticScrollTimer);
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
  }

  // ─── User intent tracking ───────────────────────────────────
  // This flag is set synchronously by wheel/touch handlers BEFORE
  // any MutationObserver or rAF callback can fire.
  private userScrolledAway = false;
  private lastScrollTop = 0;

  /**
   * Wheel event fires synchronously before scroll events.
   * If user scrolls up during generation, immediately disengage auto-scroll.
   */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent) {
    this.clearProgrammaticScroll();
    if (this.isGenerating && event.deltaY < 0) {
      this.userScrolledAway = true;
      this.chatScrollService.scrollAtBottom.set(false);
      // Cancel any pending programmatic scroll
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }
  }

  /**
   * Touch start — user is interacting, prepare to track touch scroll direction.
   */
  private touchStartY = 0;

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    this.clearProgrammaticScroll();
    if (this.isGenerating && event.touches.length > 0) {
      this.touchStartY = event.touches[0].clientY;
    }
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent) {
    this.clearProgrammaticScroll();
    if (this.isGenerating && event.touches.length > 0) {
      const deltaY = this.touchStartY - event.touches[0].clientY;
      // deltaY < 0 means finger moved down = scrolling up
      if (deltaY < -5) {
        this.userScrolledAway = true;
        this.chatScrollService.scrollAtBottom.set(false);
        if (this.rafId) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
      }
    }
  }

  private clearProgrammaticScroll() {
    this.programmaticTargetIndex = null;
    if (this.programmaticScrollTimer) {
      clearTimeout(this.programmaticScrollTimer);
      this.programmaticScrollTimer = undefined;
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    const el = this.el.nativeElement;
    if (el.scrollHeight <= el.clientHeight + 5) {
      this.chatScrollService.scrollAtBottom.set(true);
    }
  }

  @HostListener('scroll')
  onScroll() {
    const el = this.el.nativeElement;
    // When content does not exceed container height, it cannot overflow or scroll away from bottom
    if (el.scrollHeight <= el.clientHeight + 5) {
      this.chatScrollService.scrollAtBottom.set(true);
      this.updateActiveQuestionOnScroll();
      return;
    }

    const currentScrollTop = el.scrollTop;
    const distanceFromBottom = Math.abs(el.scrollHeight - currentScrollTop - el.clientHeight);
    const isAtBottom = distanceFromBottom < 20;

    if (this.isGenerating) {
      if (this.userScrolledAway) {
        // User previously scrolled away. Only re-engage if they scroll
        // back to the very bottom.
        if (isAtBottom) {
          this.userScrolledAway = false;
          this.chatScrollService.scrollAtBottom.set(true);
        }
        // Otherwise, keep scrollAtBottom = false (don't change it)
      } else {
        // Auto-scroll is engaged. Detect if user is scrolling up.
        if (currentScrollTop < this.lastScrollTop - 5 && !isAtBottom) {
          this.userScrolledAway = true;
          this.chatScrollService.scrollAtBottom.set(false);
          if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
          }
        }
        // If still at bottom, keep auto-scroll engaged (no-op)
      }
    } else {
      this.chatScrollService.scrollAtBottom.set(distanceFromBottom < 80);
    }

    this.updateActiveQuestionOnScroll();
    this.lastScrollTop = currentScrollTop;
  }

  scrollToBottom() {
    const el = this.el.nativeElement;
    el.scrollTop = el.scrollHeight;
    this.lastScrollTop = el.scrollTop;
    this.chatScrollService.scrollAtBottom.set(true);
  }

  /**
   * MutationObserver watches for innerHTML changes during streaming.
   * When bot message content grows, this auto-scrolls if the user hasn't scrolled away.
   */
  private mutationObserver: MutationObserver | null = null;
  private rafId: number | null = null;

  private startMutationObserver() {
    this.stopMutationObserver();
    const el = this.el.nativeElement;

    this.mutationObserver = new MutationObserver(() => {
      // If user has explicitly scrolled away, do nothing.
      if (this.userScrolledAway) return;

      if (this.chatScrollService.scrollAtBottom()) {
        // Use rAF to batch scrolls with rendering — avoids jank
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => {
          // Double-check: user may have scrolled away between the mutation
          // and this rAF callback.
          if (!this.userScrolledAway && this.chatScrollService.scrollAtBottom()) {
            this.scrollToBottom();
          }
          this.rafId = null;
        });
      }
    });

    this.mutationObserver.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  private stopMutationObserver() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private startTemporaryScroll() {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }

    this.scrollToBottom();

    this.scrollTimer = setTimeout(() => {
      this.scrollTimer = undefined;
    }, 3000);
  }

  scrollToQuestion(question: string) {
    const target = String(question || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!target) return;

    const maxAttempts = 25;
    const delayMs = 80;
    let attempt = 0;

    const tryScroll = () => {
      attempt++;
      const container = this.el.nativeElement;
      const userMessageEls = Array.from(
        container.querySelectorAll<HTMLElement>('.message.user, .message.user-msg'),
      );

      let matchEl = userMessageEls.find((el) => {
        const txt = String(el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return txt === target;
      });

      if (!matchEl) {
        matchEl = userMessageEls.find((el) => {
          const txt = String(el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
          return txt.includes(target) || target.includes(txt);
        });
      }

      if (matchEl) {
        this.chatScrollService.scrollAtBottom.set(false);
        const parsed = this.parseMessageIndexFromId(matchEl.id);
        if (parsed !== null) {
          this.chatScrollService.activeMessageIndex.set(parsed);
          this.programmaticTargetIndex = parsed;
        }
        if (this.programmaticScrollTimer) {
          clearTimeout(this.programmaticScrollTimer);
        }
        this.programmaticScrollTimer = setTimeout(() => {
          this.programmaticTargetIndex = null;
          this.programmaticScrollTimer = undefined;
          this.updateActiveQuestionOnScroll();
        }, 1200);

        try {
          matchEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          matchEl.scrollIntoView();
        }
        return;
      }

      if (attempt < maxAttempts) {
        setTimeout(tryScroll, delayMs);
      }
    };

    setTimeout(tryScroll, 0);
  }

  scrollToMessageIndex(index: number) {
    const maxAttempts = 20;
    const delayMs = 60;
    let attempt = 0;

    const tryScroll = () => {
      attempt++;
      const container = this.el.nativeElement;
      const targetEl =
        container.querySelector<HTMLElement>(`#chat-msg-${index}`) ||
        container.querySelector<HTMLElement>(`#msg-${index}`);

      if (targetEl) {
        this.chatScrollService.scrollAtBottom.set(false);
        this.chatScrollService.activeMessageIndex.set(index);
        this.programmaticTargetIndex = index;
        if (this.programmaticScrollTimer) {
          clearTimeout(this.programmaticScrollTimer);
        }
        this.programmaticScrollTimer = setTimeout(() => {
          this.programmaticTargetIndex = null;
          this.programmaticScrollTimer = undefined;
          this.updateActiveQuestionOnScroll();
        }, 1200);

        try {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          targetEl.scrollIntoView();
        }

        targetEl.classList.remove('message-highlight-pulse');
        // Force reflow
        void targetEl.offsetWidth;
        targetEl.classList.add('message-highlight-pulse');

        setTimeout(() => {
          targetEl.classList.remove('message-highlight-pulse');
        }, 2200);
        return;
      }

      if (attempt < maxAttempts) {
        setTimeout(tryScroll, delayMs);
      }
    };

    setTimeout(tryScroll, 0);
  }

  private updateActiveQuestionOnScroll() {
    if (this.programmaticTargetIndex !== null) {
      if (this.chatScrollService.activeMessageIndex() !== this.programmaticTargetIndex) {
        this.chatScrollService.activeMessageIndex.set(this.programmaticTargetIndex);
      }
      return;
    }

    const container = this.el.nativeElement;
    const userMessageEls = Array.from(
      container.querySelectorAll<HTMLElement>('.message.user, .message.user-msg'),
    );
    if (!userMessageEls.length) return;

    const containerRect = container.getBoundingClientRect();
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

    // Edge case 1: scrolled near top -> first question
    if (container.scrollTop <= 40) {
      const firstId = userMessageEls[0].id;
      const parsed = this.parseMessageIndexFromId(firstId);
      if (parsed !== null && parsed !== this.chatScrollService.activeMessageIndex()) {
        this.chatScrollService.activeMessageIndex.set(parsed);
      }
      return;
    }

    // Edge case 2: scrolled near bottom -> last question
    if (distanceFromBottom <= 40) {
      const lastId = userMessageEls[userMessageEls.length - 1].id;
      const parsed = this.parseMessageIndexFromId(lastId);
      if (parsed !== null && parsed !== this.chatScrollService.activeMessageIndex()) {
        this.chatScrollService.activeMessageIndex.set(parsed);
      }
      return;
    }

    // Reference reading point (40% down from the top of the container)
    const referenceY = containerRect.top + containerRect.height * 0.4;

    // Check all user questions currently visible in the container viewport
    const visibleQuestions: { index: number; dist: number }[] = [];

    for (const el of userMessageEls) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom >= containerRect.top && rect.top <= containerRect.bottom) {
        const parsed = this.parseMessageIndexFromId(el.id);
        if (parsed !== null) {
          const elCenterY = rect.top + rect.height / 2;
          visibleQuestions.push({
            index: parsed,
            dist: Math.abs(elCenterY - referenceY),
          });
        }
      }
    }

    let targetIndex: number | null = null;

    if (visibleQuestions.length > 0) {
      // Pick the visible question closest to the reference reading position
      visibleQuestions.sort((a, b) => a.dist - b.dist);
      targetIndex = visibleQuestions[0].index;
    } else {
      // No question header is visible in viewport (user is reading a long bot answer).
      // Find the last question that scrolled above the viewport.
      for (const el of userMessageEls) {
        const rect = el.getBoundingClientRect();
        if (rect.top < containerRect.top) {
          const parsed = this.parseMessageIndexFromId(el.id);
          if (parsed !== null) {
            targetIndex = parsed;
          }
        }
      }

      if (targetIndex === null) {
        targetIndex = this.parseMessageIndexFromId(userMessageEls[0].id);
      }
    }

    if (targetIndex !== null && targetIndex !== this.chatScrollService.activeMessageIndex()) {
      this.chatScrollService.activeMessageIndex.set(targetIndex);
    }
  }

  private parseMessageIndexFromId(id: string | null | undefined): number | null {
    if (!id) return null;
    let numStr = '';
    if (id.startsWith('chat-msg-')) {
      numStr = id.replace('chat-msg-', '');
    } else if (id.startsWith('msg-')) {
      numStr = id.replace('msg-', '');
    }
    if (numStr) {
      const parsed = parseInt(numStr, 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }
}
