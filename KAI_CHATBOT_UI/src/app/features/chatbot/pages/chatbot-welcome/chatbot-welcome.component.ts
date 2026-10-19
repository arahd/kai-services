import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  HostListener,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { WelcomeStateComponent } from '@features/chatbot/components/welcome-state/welcome-state.component';
import { PromptComposerComponent } from '@features/chatbot/components/prompt-composer/prompt-composer.component';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';

@Component({
  selector: 'app-chatbot-welcome',
  standalone: true,
  imports: [CommonModule, WelcomeStateComponent, PromptComposerComponent],
  templateUrl: './chatbot-welcome.component.html',
  styleUrls: ['./chatbot-welcome.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatbotWelcomeComponent implements OnInit, AfterViewInit {
  public readonly chatState = inject(ChatStateService);
  public readonly chatFacade = inject(ChatFacadeService);
  public readonly chatScrollService = inject(ChatScrollService, { optional: true });
  public readonly chatModelService = inject(ChatModelService);
  public readonly layoutBridge = inject(SidenavLayoutBridgeService);
  private readonly router = inject(Router);

  mobileModelDropdownOpen = false;

  get selectedModel(): string {
    return this.chatModelService.selectedModel();
  }

  get selectedModelLabel(): string {
    return this.chatModelService.getSelectedModelLabel() || 'GPT-5.1';
  }

  get availableModels(): any[] {
    return this.chatModelService.models();
  }

  toggleMobileModelDropdown(event: Event): void {
    event.stopPropagation();
    this.mobileModelDropdownOpen = !this.mobileModelDropdownOpen;
  }

  selectModel(model: any, event: Event): void {
    event.stopPropagation();
    const email = this.chatState.userInfo?.email || null;
    this.chatModelService.selectModel(model.value, email);
    this.mobileModelDropdownOpen = false;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.mobileModelDropdownOpen = false;
  }

  @ViewChild(PromptComposerComponent) promptComposer!: PromptComposerComponent;

  readonly defaultCards = [
    {
      title: 'Image Generator',
      text: 'Generate stunning images instantly from text prompts.',
      prompt:
        'Create a modern 3D illustration of an AI assistant dashboard with glowing UI cards, soft gradients, and a premium futuristic style.',
    },
    {
      title: 'Write Copy',
      text: 'Craft engaging and persuasive text effortlessly.',
      prompt:
        'Write 10 professional and memorable brand name ideas for an AI chatbot designed for HR teams, along with a one-line tagline for each.',
    },
    {
      title: 'Write Code',
      text: 'Quickly generate clean and efficient code from text.',
      prompt:
        'Write a clean JavaScript debounce function with explanation, example usage for a search input, and best practices for performance.',
    },
  ];

  currentCards = [...this.defaultCards];

  constructor() {
    // Automatically transition to the conversation page once first message is sent
    effect(() => {
      const conv = this.chatState.currentConversation();
      if (conv && conv.messages && conv.messages.length > 0) {
        const destId = conv.conversationID || conv.tempId || conv.id?.toString();
        if (destId) {
          this.router.navigate(['/chatbot', destId], { replaceUrl: true });
        }
      }
    });
  }

  ngOnInit(): void {
    this.chatScrollService?.scrollAtBottom?.set(true);
    this.chatScrollService?.activeMessageIndex?.set(null);

    const current = this.chatState.currentConversation();
    if (!current || (current.messages && current.messages.length > 0)) {
      this.chatState.createConversation();
    }

    // Clear active project sessions when on generic /chatbot
    sessionStorage.removeItem('kai_active_project_id');
    sessionStorage.removeItem('kai_active_project_name');
    sessionStorage.removeItem('kai_pending_project_id');
    sessionStorage.removeItem('kai_pending_project_name');
    sessionStorage.removeItem('kai_project_active_conv');
    sessionStorage.removeItem('kai_active_project_conversation_id');
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.promptComposer?.autoResize();
    }, 0);

    const pendingPrompt = sessionStorage.getItem('kai_pending_prompt');
    if (pendingPrompt) {
      sessionStorage.removeItem('kai_pending_prompt');
      this.promptComposer?.setInputMessage(pendingPrompt);
      setTimeout(() => {
        this.promptComposer?.focus();
        this.promptComposer?.autoResize();
        this.promptComposer?.sendMessage?.();
      }, 100);
    }
  }

  handleCardClick(card: any): void {
    const prompt = card?.prompt || '';
    this.promptComposer?.setInputMessage(prompt);
    setTimeout(() => {
      this.promptComposer?.focus();
    }, 0);
  }

  handleCategoryPillClick(category: any): void {
    const prompt = category?.templates?.[0]?.prompt || `Help me with ${category?.name || 'my request'}`;
    this.promptComposer?.setInputMessage(prompt);
    setTimeout(() => {
      this.promptComposer?.focus();
      this.promptComposer?.autoResize();
    }, 0);
  }
}
