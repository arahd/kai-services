import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  Renderer2,
  signal,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import type { SidenavLayoutHost } from '@core/layout/sidenav-layout-host';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { ToastService } from '@core/services/toast.service';
import { TourService } from '@core/services/tour.service';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';
import { FilePreviewModalComponent } from '@features/chatbot/components/file-preview-modal/file-preview-modal.component';
import { LimitPopupComponent } from '@features/chatbot/components/limit-popup/limit-popup.component';
import { SessionExpiredPopupComponent } from '@features/chatbot/components/session-expired-popup/session-expired-popup.component';
import { HelpMenuComponent } from '@features/chatbot/components/help-menu/help-menu.component';
import { PromptComposerComponent } from '@features/chatbot/components/prompt-composer/prompt-composer.component';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ProjectStateService } from '@features/projects/services/project-state.service';
import { FileDragDropDirective } from '@shared/directives/file-drag-drop.directive';
import { ChatScrollDirective } from '@shared/directives/chat-scroll.directive';
import { ChatMessage } from '@shared/models';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    FileDragDropDirective,
    FilePreviewModalComponent,
    LimitPopupComponent,
    SessionExpiredPopupComponent,
    HelpMenuComponent,
    ChatIconComponent,
  ],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatbotComponent implements OnInit, OnDestroy, AfterViewInit {
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
  showPopover = false;
  isDragOverPage = false;
  sidebarOpen = false;

  @ViewChild(PromptComposerComponent) promptComposer?: PromptComposerComponent;
  @ViewChild(ChatScrollDirective) chatScroll?: ChatScrollDirective;

  protected readonly layoutBridge = inject(SidenavLayoutBridgeService);
  public readonly chatFacade = inject(ChatFacadeService);
  public readonly chatModelService = inject(ChatModelService);
  public readonly chatState = inject(ChatStateService);
  public readonly chatScrollService = inject(ChatScrollService);
  readonly toastService = inject(ToastService);
  private readonly configService = inject(ConfigService);
  private readonly tourService = inject(TourService);
  private readonly renderer = inject(Renderer2);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly projectState = inject(ProjectStateService, { optional: true });
  private readonly storageService = inject(SessionStorageService, { optional: true });

  readonly activeProjectBreadcrumb = signal<{
    projectId: string | number;
    projectName: string;
  } | null>(null);

  readonly isConversationLoading = signal<boolean>(false);
  copied: { [key: string]: boolean } = {};
  showPopup = false;
  augUrls: any[] = [];

  uploadUrl = '';
  deleteUrlBase = '';

  ngOnInit(): void {
    this.uploadUrl = `${this.configService.getAzureUrl()}/indexer/indexer`;
    this.deleteUrlBase = `${this.configService.getAzureUrl()}/indexer/delete`;

    this.chatState.initConversation();

    const host: SidenavLayoutHost = {
      generatingStates: this.chatFacade.history.generatingStates(),
      getStreaming: () => this.chatFacade.history.streaming(),
      handleStreamingToggle: (next) => {
        this.chatFacade.history.streaming.set(next);
      },
      emitActiveChatOnInit: false,
      staticMode: false,
      onNewChat: () => this.createConversation(),
      onChatSelected: (chat) => this.loadConversation(chat as any),
      onSearchModalToggle: (open) => this.onSearchModalToggle(open),
      onContextMenuToggled: () => {
        this.showPopover = false;
      },
      onInvalidConversation: () => this.chatState.clearInvalidChat(),
    };
    this.layoutBridge.registerHost(host);
  }

  ngAfterViewInit(): void {
    this.tourService.startTourIfNotSeen();
  }

  ngOnDestroy(): void {
    this.layoutBridge.unregisterHost();
    this.chatState.destroyConversation();
  }

  isAnyGenerating(): boolean {
    const states = this.chatFacade.history.generatingStates();
    return Object.values(states).some((v) => v);
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any): void {
    if (this.isAnyGenerating()) {
      $event.preventDefault();
      $event.returnValue = '';
    }
  }

  createConversation(): void {
    this.chatScrollService.scrollToBottom();
    const currentPrompt = this.promptComposer?.inputMessage;
    const previews = this.promptComposer
      ? this.chatFacade.attachment.filePreviews()
      : undefined;
    this.chatState.createConversation(currentPrompt, previews);
    this.promptComposer?.reset();

    sessionStorage.removeItem('kai_active_project_id');
    sessionStorage.removeItem('kai_active_project_name');
    sessionStorage.removeItem('kai_project_active_conv');
    sessionStorage.removeItem('kai_active_project_conversation_id');
    this.activeProjectBreadcrumb.set(null);
    this.router?.navigate(['/chatbot']);
  }

  async loadConversation(chat: any): Promise<void> {
    const convId = chat?.conversationID;
    if (convId) {
      if (chat?.project_id) {
        sessionStorage.setItem('kai_active_project_id', String(chat.project_id));
        if (chat.project_name) {
          sessionStorage.setItem('kai_active_project_name', chat.project_name);
        }
      }
      this.router?.navigate(['/chatbot', convId]);
    } else {
      this.router?.navigate(['/chatbot']);
    }

    // Only load data if the object actually has full messages or bot responses,
    // otherwise the routed ChatbotConversationComponent handles fetching by ID.
    const hasFullMessages =
      Array.isArray(chat?.messages) && chat.messages.length > 0;
    const hasFullResponses =
      Array.isArray(chat?.conversation) &&
      chat.conversation.some((c: any) => c.response != null && c.response !== '');

    if (hasFullMessages || hasFullResponses) {
      this.chatScrollService.scrollToBottom();
      const currentPrompt = this.promptComposer?.inputMessage;
      const previews = this.promptComposer
        ? this.chatFacade.attachment.filePreviews()
        : undefined;
      await this.chatState.loadConversationData(chat, currentPrompt, previews);
    }
  }

  handleCardClick(card: any): void {
    const prompt = card?.prompt || '';
    this.promptComposer?.setInputMessage(prompt);
    setTimeout(() => {
      this.promptComposer?.focus();
    }, 0);
  }

  onFilesDropped(files: FileList): void {
    const conv = this.chatState.currentConversation();
    this.chatFacade.addFiles(files, conv?.conversationID || '');
    this.showPopover = false;
  }

  onSearchModalToggle(event: boolean): void {
    this.chatScrollService.scrollAtBottom.set(true);
  }

  closeLimitPopup(): void {
    this.chatState.showLimitPopup.set(false);
  }

  closeSessionExpiredPopup(): void {
    this.chatState.showSessionExpiredPopup.set(false);
  }

  handleExpiredSession(): void {
    this.chatState.showSessionExpiredPopup.set(false);
    this.createConversation();
  }

  toggleMessageCollapse(msg: ChatMessage): void {
    msg.collapsed = !msg.collapsed;
  }

  private _mobileSidebarOpen = false;
  get mobileSidebarOpen(): boolean {
    return this._mobileSidebarOpen;
  }
  set mobileSidebarOpen(value: boolean) {
    this._mobileSidebarOpen = value;
    if (value) {
      this.renderer.setStyle(document.body, 'overflow', 'hidden');
    } else {
      this.renderer.removeStyle(document.body, 'overflow');
    }
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  togglePopover(event: MouseEvent): void {
    event.stopPropagation();
    this.showPopover = !this.showPopover;
  }

  editUserMessage(msg: ChatMessage): void {
    this.promptComposer?.setInputMessage(msg.message);
    setTimeout(() => {
      this.promptComposer?.focus();
    }, 0);
  }

  cancelEdit(msg: ChatMessage): void {
    msg.editable = false;
  }

  reloadUserMessage(msg: ChatMessage): void {
    const previews = this.chatFacade.attachment.filePreviews();
    this.chatState.sendMessage(msg.message, previews);
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

  stripHtml(html: string): string {
    return this.chatFacade.clipboard.stripHtml(html);
  }

  shareMessage(msg: ChatMessage): void {
    this.chatFacade.clipboard.shareMessage(msg);
  }

  scrollToBottom(): void {
    this.chatScrollService.scrollToBottom();
  }

  logout(): void {
    this.chatFacade.azureAd.logout();
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

  openAugUrlPopup(data: any[]): void {
    this.augUrls = data;
    this.showPopup = true;
  }

  onPopupClose(): void {
    this.showPopup = false;
  }

  hasContextAndSource(augurls: any[] | undefined): boolean {
    return !!augurls && augurls.some((a) => a.source);
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

  retryMessage(index: number): void {
    const conv = this.chatState.currentConversation();
    if (!conv) return;
    const convId = conv.conversationID || conv.id.toString();
    if (this.chatState.isChatGenerating(convId)) return;
    this.chatState.retryMessage(index);
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

  canShowImageActions(msg: ChatMessage): boolean {
    return (
      Array.isArray(msg.images) &&
      msg.images.length > 0 &&
      !msg.isImageLoading &&
      !msg.imageLoadError
    );
  }

  canShowDocumentActions(msg: ChatMessage): boolean {
    return (
      Array.isArray(msg.documents) &&
      msg.documents.length > 0 &&
      !msg.isDocumentLoading &&
      !msg.documentLoadError
    );
  }

  canShowTextActions(msg: ChatMessage): boolean {
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
    this.router?.navigate(['/projects']);
  }

  goToProject(projectId?: string | number): void {
    const id = projectId || this.activeProjectBreadcrumb()?.projectId;
    if (id) {
      this.router?.navigate(['/projects', id]);
    } else {
      this.router?.navigate(['/projects']);
    }
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest?.('.popover') || target.closest?.('.plus-btn')) {
      return;
    }
    this.showPopover = false;
  }
}
