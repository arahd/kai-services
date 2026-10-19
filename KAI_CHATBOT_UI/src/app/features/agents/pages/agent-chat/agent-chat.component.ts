import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastService } from '@core/services/toast.service';
import { Subscription } from 'rxjs';
import { AgentChatMessage, AgentItem } from '../../models/agent.model';
import { AgentService } from '../../services/agent.service';
import { MarkdownPipe } from '@shared/pipes/markdown.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-agent-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MarkdownPipe],
  templateUrl: './agent-chat.component.html',
  styleUrls: ['./agent-chat.component.scss'],
})
export class AgentChatComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly agentService = inject(AgentService);
  private readonly toastService = inject(ToastService);

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('promptInput') private promptInput?: ElementRef<HTMLTextAreaElement>;

  readonly agent = signal<AgentItem | null>(null);
  readonly messages = signal<AgentChatMessage[]>([]);
  readonly isSending = signal<boolean>(false);
  readonly currentChatId = signal<string | undefined>(undefined);

  userPrompt = '';
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = this.route.params.subscribe((params) => {
      const agentId = params['agentId'];
      if (agentId) {
        this.loadAgent(agentId);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private loadAgent(agentId: string): void {
    const existing = this.agentService.getAgentById(agentId);
    if (existing) {
      this.initAgentSession(existing);
    } else {
      this.agentService.getAgents().subscribe(() => {
        const found = this.agentService.getAgentById(agentId);
        if (found) {
          this.initAgentSession(found);
        } else {
          this.toastService.show('Agent not found', 'error');
          this.router.navigate(['/agents']);
        }
      });
    }
  }

  private initAgentSession(agent: AgentItem): void {
    this.agent.set(agent);
    this.agentService.selectedAgent.set(agent);
    this.currentChatId.set(undefined);

    // Initial greeting message
    this.messages.set([
      {
        id: 'init-1',
        sender: 'agent',
        message: `Hello! I am **${agent.agent_name}** (${agent.agent_type}). How can I assist you today?`,
        timestamp: new Date(),
      },
    ]);

    this.userPrompt = '';
    setTimeout(() => {
      this.promptInput?.nativeElement?.focus();
      this.autoResize();
    }, 100);
  }

  onInput(): void {
    this.autoResize();
  }

  autoResize(): void {
    const el = this.promptInput?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(Math.max(el.scrollHeight, 24), 180);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = el.scrollHeight > 180 ? 'auto' : 'hidden';
  }

  sendMessage(): void {
    const prompt = this.userPrompt.trim();
    const currentAgent = this.agent();
    if (!prompt || !currentAgent || this.isSending()) return;

    // Add User Message
    const userMsg: AgentChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      message: prompt,
      timestamp: new Date(),
    };

    this.messages.update((msgs) => [...msgs, userMsg]);
    this.userPrompt = '';
    setTimeout(() => this.autoResize(), 0);
    this.isSending.set(true);
    this.scrollToBottom();

    // Call Agent Chat
    this.agentService
      .sendAgentPrompt(currentAgent, prompt, this.currentChatId())
      .subscribe({
        next: (response) => {
          if (response.chatId) {
            this.currentChatId.set(response.chatId);
          }

          const agentMsg: AgentChatMessage = {
            id: `agent-${Date.now()}`,
            sender: 'agent',
            message: response.message,
            timestamp: new Date(),
            chatId: response.chatId,
          };

          this.messages.update((msgs) => [...msgs, agentMsg]);
          this.isSending.set(false);
          this.scrollToBottom();
        },
        error: (err) => {
          console.error('Agent chat error:', err);
          const errorMsg: AgentChatMessage = {
            id: `err-${Date.now()}`,
            sender: 'agent',
            message: '⚠️ An error occurred while communicating with the agent. Please try again.',
            timestamp: new Date(),
          };
          this.messages.update((msgs) => [...msgs, errorMsg]);
          this.isSending.set(false);
          this.scrollToBottom();
        },
      });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  copyMessage(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.toastService.show('Message copied to clipboard', 'info');
    });
  }

  clearChat(): void {
    const currentAgent = this.agent();
    if (!currentAgent) return;
    this.initAgentSession(currentAgent);
    this.toastService.show('Conversation reset', 'info');
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer?.nativeElement) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    }, 50);
  }
}
