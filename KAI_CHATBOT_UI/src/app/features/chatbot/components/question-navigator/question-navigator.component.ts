import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatMessage } from '@shared/models';

export interface NavQuestionItem {
  id: string;
  qNumber: number;
  messageIndex: number;
  text: string;
  timestamp: Date;
  hasAttachments: boolean;
  attachmentCount: number;
  hasImages: boolean;
}

@Component({
  selector: 'app-question-navigator',
  standalone: true,
  imports: [CommonModule, FormsModule, ChatIconComponent],
  templateUrl: './question-navigator.component.html',
  styleUrls: ['./question-navigator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionNavigatorComponent {
  readonly messages = input<ChatMessage[] | undefined>(undefined);

  protected readonly chatState = inject(ChatStateService);
  public readonly chatScrollService = inject(ChatScrollService);

  readonly isCollapsed = signal<boolean>(true);
  readonly searchQuery = signal<string>('');
  readonly isMobileDrawerOpen = signal<boolean>(false);

  readonly questions = computed<NavQuestionItem[]>(() => {
    const currentConv = this.chatState.currentConversation();
    const msgs = this.messages() ?? currentConv?.messages ?? [];
    if (!msgs || msgs.length === 0) return [];

    let qCount = 0;
    const result: NavQuestionItem[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.sender === 'user' && !msg.isPlaceholder) {
        qCount++;
        let rawText = '';
        if (typeof msg.message === 'string') {
          rawText = msg.message;
        } else if (msg.formatted) {
          rawText = msg.formatted;
        } else if (msg.content) {
          rawText = String(msg.content);
        } else if (msg.attachments && msg.attachments.length > 0) {
          rawText = msg.attachments.map((a) => a.name).join(', ');
        }

        const cleanText =
          rawText.replace(/\s+/g, ' ').trim() || 'Attachment query';
        const attCount =
          (msg.attachments?.length || 0) + (msg.images?.length || 0);

        result.push({
          id: `chat-msg-${i}`,
          qNumber: qCount,
          messageIndex: i,
          text: cleanText,
          timestamp:
            msg.timestamp instanceof Date
              ? msg.timestamp
              : new Date(msg.timestamp || Date.now()),
          hasAttachments: attCount > 0,
          attachmentCount: attCount,
          hasImages: !!(msg.images && msg.images.length > 0),
        });
      }
    }

    return result;
  });

  readonly filteredQuestions = computed(() => {
    const all = this.questions();
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return all;
    return all.filter(
      (q) =>
        q.text.toLowerCase().includes(query) ||
        `q${q.qNumber}`.toLowerCase().includes(query),
    );
  });

  readonly shouldShow = computed(() => {
    return this.questions().length >= 2;
  });

  formatTime(date: Date): string {
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  onQuestionClick(index: number): void {
    this.chatScrollService.scrollToMessageIndex(index);
    this.isMobileDrawerOpen.set(false);
  }

  onJumpToLatest(): void {
    this.chatScrollService.scrollToBottom();
    this.isMobileDrawerOpen.set(false);
  }

  toggleCollapse(): void {
    this.isCollapsed.update((val) => !val);
  }

  toggleMobileDrawer(): void {
    this.isMobileDrawerOpen.update((val) => !val);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }
}
