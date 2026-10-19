import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  input,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BotMessageComponent } from '@features/chatbot/components/bot-message/bot-message.component';
import { UserMessageComponent } from '@features/chatbot/components/user-message/user-message.component';
import { PromptComposerComponent } from '@features/chatbot/components/prompt-composer/prompt-composer.component';
import { QuestionNavigatorComponent } from '@features/chatbot/components/question-navigator/question-navigator.component';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';
import { CommonPopupComponent } from '@shared/components/common-popup/common-popup.component';
import { ChatScrollDirective } from '@shared/directives/chat-scroll.directive';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { ProjectStateService } from '@features/projects/services/project-state.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { ToastService } from '@core/services/toast.service';
import { ChatMessage } from '@shared/models';

@Component({
  selector: 'app-chatbot-conversation',
  standalone: true,
  imports: [
    CommonModule,
    UserMessageComponent,
    BotMessageComponent,
    PromptComposerComponent,
    QuestionNavigatorComponent,
    ChatIconComponent,
    CommonPopupComponent,
    ChatScrollDirective,
  ],
  templateUrl: './chatbot-conversation.component.html',
  styleUrls: ['./chatbot-conversation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatbotConversationComponent implements OnInit {
  // Bound via router withComponentInputBinding()
  readonly convoId = input<string>();
  readonly conversationId = input<string>();
  readonly projectId = input<string>();

  public readonly chatState = inject(ChatStateService);
  public readonly chatFacade = inject(ChatFacadeService);
  public readonly chatScrollService = inject(ChatScrollService);
  private readonly projectState = inject(ProjectStateService, { optional: true });
  private readonly storageService = inject(SessionStorageService, { optional: true });
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild(PromptComposerComponent) promptComposer?: PromptComposerComponent;
  @ViewChild(ChatScrollDirective) chatScroll?: ChatScrollDirective;

  readonly isConversationLoading = signal<boolean>(false);
  readonly activeProjectBreadcrumb = signal<{
    projectId: string | number;
    projectName: string;
  } | null>(null);

  /** Derives the conversation display name for the breadcrumb from title or first user message */
  readonly conversationBreadcrumbName = computed(() => {
    const conv = this.chatState.currentConversation();
    if (!conv) return 'Chat';

    // Prefer conversation title if available and meaningful
    if (conv.title && conv.title.trim() && conv.title !== 'New Chat' && conv.title !== 'Untitled') {
      return conv.title.trim();
    }

    // Fall back to first user message
    if (conv.messages && conv.messages.length > 0) {
      const firstUserMsg = conv.messages.find(m => m.sender === 'user');
      if (firstUserMsg) {
        const text = (typeof firstUserMsg.message === 'string' ? firstUserMsg.message : '').trim();
        if (text) return text;
      }
    }

    return 'Chat';
  });

  copied: { [key: string]: boolean } = {};
  showPopup = false;
  augUrls: any[] = [];
  private lastLoadedId: string | null = null;

  constructor() {
    // Reactively watch for route parameter changes
    effect(() => {
      const id =
        this.convoId() ||
        this.conversationId() ||
        this.route.snapshot.paramMap.get('convoId') ||
        this.route.snapshot.paramMap.get('conversationId');
      if (id && id !== this.lastLoadedId) {
        this.handleConversationId(id);
      }
    });
  }

  ngOnInit(): void {
    this.restoreProjectContext();
    const id =
      this.convoId() ||
      this.conversationId() ||
      this.route.snapshot.paramMap.get('convoId') ||
      this.route.snapshot.paramMap.get('conversationId');
    if (id && id !== this.lastLoadedId) {
      this.handleConversationId(id);
    }
  }

  private restoreProjectContext(): void {
    const isProjectRoute =
      this.router.url.includes('/projects') ||
      this.router.url.includes('projects') ||
      !!this.route.snapshot.paramMap.get('projectId') ||
      !!this.projectId?.();

    if (!isProjectRoute) {
      this.activeProjectBreadcrumb.set(null);
      return;
    }

    const routeProjId =
      this.projectId?.() ||
      this.route.snapshot.paramMap.get('projectId') ||
      sessionStorage.getItem('kai_active_project_id');
    const projName = sessionStorage.getItem('kai_active_project_name');

    if (routeProjId && projName) {
      this.activeProjectBreadcrumb.set({ projectId: routeProjId, projectName: projName });
    } else if (routeProjId && !projName && this.projectState) {
      this.projectState.getOrFetchProject(Number(routeProjId)).then((p) => {
        if (p) {
          sessionStorage.setItem('kai_active_project_name', p.project_name);
          this.activeProjectBreadcrumb.set({ projectId: routeProjId, projectName: p.project_name });
          this.cdr.markForCheck();
        }
      });
    }
  }

  private currentLoadId = 0;

  private async handleConversationId(id: string): Promise<void> {
    const loadId = ++this.currentLoadId;

    const current = this.chatState.currentConversation();
    const isMatchingCurrent =
      current &&
      (current.conversationID === id ||
        current.id?.toString() === id ||
        current.tempId === id);

    const isTargetGenerating =
      this.chatState.isChatGenerating(id) ||
      !!this.chatFacade.history.generatingStates()[id];

    // If this specific conversation is currently generating (generatingStates[id] is true)
    // or is the current in-flight temp conversation, restore it from memory.
    if (
      (isTargetGenerating || (isMatchingCurrent && !!current?.tempId)) &&
      this.chatState.restoreFromMemory(id)
    ) {
      this.lastLoadedId = id;
      this.isConversationLoading.set(false);
      this.storageService?.setConversationId(id);
      this.storageService?.setLastActiveConversationId(id);
      this.chatFacade.history.activeConversationID.set(id);
      setTimeout(() => this.chatScrollService.scrollToBottom(), 100);
      return;
    }

    if (!isMatchingCurrent && current) {
      const prevKey = current.conversationID || current.tempId || current.id?.toString();
      if (typeof (this.promptComposer as any)?.saveCurrentState === 'function') {
        (this.promptComposer as any).saveCurrentState(prevKey);
      }
      // If the target conversation is already cached in memory, switch to it immediately
      // to prevent showing stale messages from the previous conversation.
      if (!this.chatState.restoreFromMemory(id)) {
        this.chatState.currentConversation.set(null);
      }
    }

    if (isMatchingCurrent && current.messages && current.messages.length > 0) {
      const lastMsg = current.messages[current.messages.length - 1];

      // If the last message is from the user or is a placeholder bot message, sendMessage is in flight.
      if (lastMsg && (lastMsg.sender === 'user' || lastMsg.isPlaceholder)) {
        this.lastLoadedId = id;
        this.isConversationLoading.set(false);
        return;
      }

      const isCompleted =
        lastMsg &&
        lastMsg.sender === 'bot' &&
        lastMsg.status === 'completed' &&
        !lastMsg.isPlaceholder;

      // If the conversation is already in memory and complete, reuse it without an API call.
      if (isCompleted) {
        const isProjectRoute =
          this.router.url.includes('/projects') ||
          this.router.url.includes('projects') ||
          !!this.route.snapshot.paramMap.get('projectId') ||
          !!this.projectId?.();

        if (isProjectRoute) {
          this.restoreProjectContext();
          const routeProjId =
            this.projectId?.() ||
            this.route.snapshot.paramMap.get('projectId') ||
            sessionStorage.getItem('kai_active_project_id');
          if (routeProjId) {
            current.is_project_chat = true;
            current.project_id = Number(routeProjId);
          }
        }

        this.lastLoadedId = id;
        this.isConversationLoading.set(false);
        this.cdr.markForCheck();
        return;
      }
    }

    const isProjectRoute =
      this.router.url.includes('/projects') ||
      this.router.url.includes('projects') ||
      !!this.route.snapshot.paramMap.get('projectId') ||
      !!this.projectId?.();

    const isNewProjectConv =
      isProjectRoute &&
      (sessionStorage.getItem('kai_is_new_project_conversation') === 'true' ||
        id.startsWith('temp-') ||
        id === 'new' ||
        !!sessionStorage.getItem('kai_pending_prompt'));

    if (isNewProjectConv) {
      this.lastLoadedId = id;
      this.isConversationLoading.set(false);
      this.restoreProjectContext();

      const routeProjId =
        this.projectId?.() ||
        this.route.snapshot.paramMap.get('projectId') ||
        sessionStorage.getItem('kai_active_project_id');

      if (routeProjId) {
        sessionStorage.setItem('kai_active_project_id', String(routeProjId));
        sessionStorage.setItem('kai_active_project_conversation_id', id);
      }

      const pendingPrompt = sessionStorage.getItem('kai_pending_prompt');
      sessionStorage.removeItem('kai_pending_prompt');
      sessionStorage.removeItem('kai_is_new_project_conversation');

      let pendingFiles: any[] = [];
      if (this.chatFacade?.attachment?.pendingAttachments()?.length) {
        pendingFiles = [...this.chatFacade.attachment.pendingAttachments()];
        this.chatFacade.attachment.pendingAttachments.set([]);
      }
      if (pendingFiles.length === 0) {
        const rawPending = sessionStorage.getItem('kai_pending_attachments');
        if (rawPending) {
          try {
            pendingFiles = JSON.parse(rawPending);
          } catch {}
        }
      }
      sessionStorage.removeItem('kai_pending_attachments');

      if (pendingPrompt || pendingFiles.length > 0) {
        let conv = this.chatState.currentConversation();
        if (!conv || (conv.conversationID !== id && conv.tempId !== id)) {
          conv = this.chatState.createConversation(
            undefined,
            undefined,
            id,
            true,
            routeProjId,
          );
        }
        if (conv) {
          conv.is_project_chat = true;
          conv.project_id = routeProjId || undefined;
          if (id.startsWith('temp-')) {
            conv.tempId = id;
          } else {
            conv.conversationID = id;
          }
        }

        setTimeout(() => {
          this.chatState.sendMessage(pendingPrompt || '', pendingFiles);
        }, 50);
      }

      this.cdr.markForCheck();
      return;
    }

    if (id.startsWith('temp-')) {
      this.lastLoadedId = id;
      this.isConversationLoading.set(false);
      return;
    }

    this.isConversationLoading.set(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    if (this.currentLoadId !== loadId) return;

    try {
      const routeProjId = isProjectRoute
        ? (this.projectId?.() || this.route.snapshot.paramMap.get('projectId') || sessionStorage.getItem('kai_active_project_id'))
        : null;

      if (isProjectRoute && routeProjId && this.projectState) {
        // Project conversation load
        sessionStorage.setItem('kai_active_project_id', String(routeProjId));
        sessionStorage.setItem('kai_active_project_conversation_id', id);

        let res: any = null;
        try {
          res = await this.projectState.loadProjectConversationMessages(Number(routeProjId), id);
        } catch (e) {
          console.warn('Could not load project conversation messages via API:', e);
        }

        if (this.currentLoadId !== loadId) return;

        if (res?.conversation && res.conversation.length > 0) {
          await this.chatState.loadConversationData({
            conversationID: id,
            conversation: res.conversation,
            conversationName: res.conversationName || 'Conversation',
            is_project_chat: true,
            project_id: routeProjId,
          });

          sessionStorage.setItem('kai_project_active_conv', JSON.stringify({
            id: Date.now(),
            conversationID: id,
            title: res.conversationName || 'Conversation',
            messages: this.chatState.currentConversation()?.messages || [],
            conversation: res.conversation,
          }));
        } else {
          // Check if sessionStorage has cached conversation from openConversation
          const rawCached = sessionStorage.getItem('kai_project_active_conv');
          if (rawCached) {
            try {
              const parsed = JSON.parse(rawCached);
              if (parsed.conversationID === id && parsed.messages?.length > 0) {
                this.chatState.currentConversation.set({
                  id: parsed.id || Date.now(),
                  conversationID: id,
                  title: parsed.title || 'Conversation',
                  messages: parsed.messages,
                  is_project_chat: true,
                  project_id: routeProjId,
                } as any);
              }
            } catch (e) {
              console.warn('Failed to parse cached project conversation', e);
            }
          }
        }
      } else {
        // Clean up any stale project keys when on regular chatbot conversation
        sessionStorage.removeItem('kai_active_project_id');
        sessionStorage.removeItem('kai_active_project_name');
        sessionStorage.removeItem('kai_project_active_conv');
        sessionStorage.removeItem('kai_active_project_conversation_id');
        this.activeProjectBreadcrumb.set(null);

        // Standard chatbot conversation load
        const email = this.chatState.userInfo.email || this.chatFacade.token.getUserInfo()?.email || '';
        await new Promise<void>((resolve, reject) => {
          this.chatFacade.history.loadConversationMessages(
            email,
            id,
            async (fullChat) => {
              if (this.currentLoadId !== loadId) {
                resolve();
                return;
              }
              if (fullChat && (fullChat.conversation || fullChat.conversationID)) {
                await this.chatState.loadConversationData(fullChat);
                this.cdr.markForCheck();
                resolve();
              } else {
                reject(new Error('Conversation not found'));
              }
            },
            (err) => {
              if (this.currentLoadId === loadId) {
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });
      }

      if (this.currentLoadId !== loadId) return;

      this.lastLoadedId = id;
      this.storageService?.setConversationId(id);
      if (!isProjectRoute) {
        this.storageService?.setLastActiveConversationId(id);
        this.chatFacade.history.activeConversationID.set(id);
      }
      setTimeout(() => this.chatScrollService.scrollToBottom(), 100);
    } catch (err) {
      if (this.currentLoadId !== loadId) return;
      console.warn('Failed to load conversation:', id, err);

      // If the conversation is available in memory or actively generating, restore it rather than kicking the user out.
      if (this.chatState.hasInMemoryConversation(id) || this.chatState.isChatGenerating(id)) {
        this.chatState.restoreFromMemory(id);
        this.lastLoadedId = id;
        this.isConversationLoading.set(false);
        this.cdr.markForCheck();
        return;
      }

      this.toastService.show('Conversation not found or has been deleted', 'error');
      this.router.navigate(['/chatbot'], { replaceUrl: true });
    } finally {
      if (this.currentLoadId === loadId) {
        this.isConversationLoading.set(false);
        this.cdr.markForCheck();
      }
    }
  }

  shouldShowDateSeparator(index: number): boolean {
    const conv = this.chatState.currentConversation();
    if (!conv || !conv.messages) return false;
    const messages = conv.messages;
    if (index === 0) return true;

    const prevMsg = messages[index - 1];
    const currMsg = messages[index];
    if (!prevMsg.timestamp || !currMsg.timestamp) return false;

    const prevDate = this.chatState.parseMessageTimestamp(prevMsg.timestamp);
    const currDate = this.chatState.parseMessageTimestamp(currMsg.timestamp);

    return prevDate.toDateString() !== currDate.toDateString();
  }

  getDateSeparatorLabel(index: number): string {
    const conv = this.chatState.currentConversation();
    if (!conv || !conv.messages) return '';
    const msg = conv.messages[index];
    if (!msg.timestamp) return '';

    const date = this.chatState.parseMessageTimestamp(msg.timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      };
      return date.toLocaleDateString('en-US', options);
    }
  }

  copyUserMessage(msg: any, index: number): void {
    this.chatFacade.clipboard.copyUserMessage(msg, index, (idx: any) => {
      this.copied[idx] = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.copied[idx] = false;
        this.cdr.markForCheck();
      }, 1500);
    });
  }

  copyBotMessage(msg: any, index: number): void {
    this.chatFacade.clipboard.copyBotMessage(
      msg,
      index,
      (idx: any, toastMsg: any) => {
        this.copied[idx] = true;
        this.cdr.markForCheck();
        setTimeout(() => {
          this.copied[idx] = false;
          this.cdr.markForCheck();
        }, 1500);
        this.toastService.show(toastMsg, 'success');
      }
    );
  }

  editUserMessage(msg: ChatMessage): void {
    this.promptComposer?.setInputMessage(msg.message);
    setTimeout(() => {
      this.promptComposer?.focus();
    }, 0);
  }

  toggleMessageCollapse(msg: ChatMessage): void {
    msg.collapsed = !msg.collapsed;
  }

  shareMessage(msg: ChatMessage): void {
    this.chatFacade.clipboard.shareMessage(msg);
  }

  retryMessage(index: number): void {
    const conv = this.chatState.currentConversation();
    if (!conv) return;
    const convId = conv.conversationID || conv.id.toString();
    if (this.chatState.isChatGenerating(convId)) return;
    this.chatState.retryMessage(index);
  }

  previewBotImage(img: { url: string; name: string }): void {
    this.chatFacade.attachment.activePreviewFile.set({
      file: null as any,
      name: img.name.endsWith('.png') ? img.name : `${img.name}.png`,
      size: 0,
      previewUrl: img.url,
      uploading: false,
      progress: 100,
      uploaded: true,
      isImage: true,
    } as any);
  }

  openAugUrlPopup(data: any[]): void {
    this.augUrls = data;
    this.showPopup = true;
  }

  onPopupClose(): void {
    this.showPopup = false;
  }

  handleSuggestionClick(question: string): void {
    const conv = this.chatState.currentConversation();
    if (!conv) return;
    const convId = conv.conversationID || conv.id?.toString();
    if (this.chatState.isChatGenerating(convId)) return;

    this.promptComposer?.setInputMessage(question);
    setTimeout(() => {
      this.promptComposer?.focus();
    }, 0);
  }

  canShowMessageActions(msg: ChatMessage): boolean {
    if (
      (msg.role !== 'assistant' && msg.sender !== 'bot') ||
      msg.status !== 'completed' ||
      msg.isPlaceholder
    ) {
      return false;
    }

    if (msg.isImageLoading || msg.isDocumentLoading) {
      return false;
    }

    return (
      this.canShowImageActions(msg) ||
      this.canShowDocumentActions(msg) ||
      this.canShowTextActions(msg)
    );
  }

  private canShowImageActions(msg: ChatMessage): boolean {
    return (
      Array.isArray(msg.images) &&
      msg.images.length > 0 &&
      !msg.isImageLoading &&
      !msg.imageLoadError
    );
  }

  private canShowDocumentActions(msg: ChatMessage): boolean {
    return (
      Array.isArray(msg.documents) &&
      msg.documents.length > 0 &&
      !msg.isDocumentLoading &&
      !msg.documentLoadError
    );
  }

  private canShowTextActions(msg: ChatMessage): boolean {
    const textMsg = (
      typeof msg.content === 'string'
        ? msg.content
        : typeof msg.message === 'string'
          ? msg.message
          : ''
    ).trim();
    const htmlMsg = (typeof msg.html === 'string' ? msg.html : '').trim();
    return !!htmlMsg || textMsg.length > 0;
  }

  goToProjects(): void {
    this.router.navigate(['/projects']);
  }

  goToProject(projectId?: string | number): void {
    const id = projectId || this.activeProjectBreadcrumb()?.projectId;
    if (id) {
      this.router.navigate(['/projects', id]);
    } else {
      this.router.navigate(['/projects']);
    }
  }
}
