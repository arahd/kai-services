import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ChatScrollService {
  readonly scrollAtBottom = signal<boolean>(true);
  readonly activeMessageIndex = signal<number | null>(null);
  readonly scrollRequest$ = new Subject<void>();
  readonly questionScrollRequest$ = new Subject<string>();
  readonly messageIndexScrollRequest$ = new Subject<number>();

  scrollToBottom() {
    this.scrollRequest$.next();
    this.scrollAtBottom.set(true);
  }

  scrollToQuestion(question: string) {
    this.questionScrollRequest$.next(question);
  }

  scrollToMessageIndex(index: number) {
    this.activeMessageIndex.set(index);
    this.messageIndexScrollRequest$.next(index);
  }
}
