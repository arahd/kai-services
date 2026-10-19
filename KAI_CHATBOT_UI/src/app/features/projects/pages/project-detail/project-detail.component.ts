import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
  HostListener,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ProjectStateService } from '../../services/project-state.service';
import { ProjectConversation, ProjectItem } from '../../models/project.model';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';
import { MarkdownService } from '@shared/services/markdown.service';
import { ChatContextMenuComponent } from '@features/sidenav/components/chat-context-menu/chat-context-menu.component';
import { PromptComposerComponent } from '@features/chatbot/components/prompt-composer/prompt-composer.component';
import { SidenavIconComponent } from '@features/sidenav/components/sidenav-icon/sidenav-icon.component';
import { TooltipDirective } from '@shared/directives/tooltip.directive';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    ChatContextMenuComponent,
    PromptComposerComponent,
    SidenavIconComponent,
    TooltipDirective,
  ],
  templateUrl: './project-detail.component.html',
  styleUrls: ['./project-detail.component.scss'],
})
export class ProjectDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly state = inject(ProjectStateService);
  readonly layoutBridge = inject(SidenavLayoutBridgeService);
  private readonly storage = inject(SessionStorageService);
  private readonly chatApi = inject(ChatApiService);
  private readonly toastService = inject(ToastService);
  private readonly tokenService = inject(TokenService);
  private readonly markdownService = inject(MarkdownService);
  private readonly chatState = inject(ChatStateService, { optional: true });
  private readonly chatFacade = inject(ChatFacadeService, { optional: true });
  private readonly chatModelService = inject(ChatModelService);
  private readonly chatScrollService = inject(ChatScrollService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('promptInput') promptInput?: ElementRef<HTMLInputElement>;

  readonly project = signal<ProjectItem | null>(null);
  readonly conversations = signal<ProjectConversation[]>([]);
  readonly inputPrompt = signal<string>('');

  // Model dropdown state
  readonly isModelDropdownOpen = signal<boolean>(false);
  readonly selectedModelLabel = signal<string>('GPT-5.1');

  // Context menu state for chat items
  readonly contextMenuOpen = signal<boolean>(false);
  readonly selectedConv = signal<ProjectConversation | null>(null);
  readonly menuPosition = signal<any>({});

  // Modal states (Delete, Rename, Share) matching sidenav design
  readonly showConfirm = signal<boolean>(false);
  readonly convToDelete = signal<ProjectConversation | null>(null);

  readonly showRenameModal = signal<boolean>(false);
  readonly renameValue = signal<string>('');
  readonly convToRename = signal<ProjectConversation | null>(null);

  readonly showShareModal = signal<boolean>(false);
  readonly shareTitle = signal<string>('');
  readonly shareUrl = signal<string>('');
  readonly shareLoading = signal<boolean>(false);
  readonly shareConversationPairs = signal<Array<{ question: string; answer: string }>>([]);
  readonly shareLinkCopied = signal<boolean>(false);
  readonly convToShare = signal<ProjectConversation | null>(null);

  readonly initialConversationId = signal<string | null>(null);
  private newChatPromise: Promise<{ conversationID: string; response?: any } | null> | null = null;

  private routeSub?: Subscription;

  ngOnInit(): void {
    // Ensure scroll state is reset when entering project details
    this.chatScrollService?.scrollAtBottom?.set(true);
    this.chatScrollService?.activeMessageIndex?.set(null);

    // Ensure model is never locked in project detail
    this.chatModelService.unlockModel();

    this.routeSub = this.route.params.subscribe(async (params) => {
      let pid = Number(params['projectId']);
      if (!pid) {
        const storedPid = sessionStorage.getItem('kai_active_project_id');
        if (storedPid) pid = Number(storedPid);
      }
      if (pid) {
        sessionStorage.setItem('kai_active_project_id', String(pid));
        sessionStorage.removeItem('kai_active_project_conversation_id');

        const storedName = sessionStorage.getItem('kai_active_project_name');
        if (storedName && !this.project()) {
          this.project.set({
            project_id: pid,
            project_name: storedName,
            created_at: new Date().toISOString(),
          } as any);
        }

        const found = await this.state.getOrFetchProject(pid);
        if (found) {
          this.project.set(found);
          sessionStorage.setItem('kai_active_project_name', found.project_name);
        }
        await this.loadConversations(pid);
        this.newChat(pid);
        this.cdr.markForCheck();
      }
    });

    // Load models for model selector
    const email = this.tokenService.getUserInfo()?.email || '';
    this.chatModelService.loadModels(email);

    // Initialize model label if available
    const models = this.layoutBridge.models();
    if (models.length > 0) {
      const first = models[0];
      this.selectedModelLabel.set(typeof first === 'string' ? first : first.label || 'GPT-5.1');
    }
  }

  newChat(projectId?: number): Promise<{ conversationID: string; response?: any } | null> {
    const pid = projectId ?? this.project()?.project_id;
    if (!pid) return Promise.resolve(null);

    // Ensure model remains unlocked when preparing a new project chat
    this.chatModelService.unlockModel();

    this.newChatPromise = (async () => {
      const res = await this.state.newChat(pid);
      if (res?.conversationID) {
        this.initialConversationId.set(res.conversationID);
        this.storage.setConversationId(res.conversationID);
        if (this.chatState) {
          this.chatState.createConversation(undefined, undefined, res.conversationID, true, pid);
        }
        return res;
      }
      return null;
    })();

    return this.newChatPromise;
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  private async loadConversations(projectId: number): Promise<void> {
    await this.state.loadProjectConversations(projectId);
    const convs = this.state.projectConversations();
    const sorted = [...(convs || [])].sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) {
        return a.is_pinned ? -1 : 1;
      }
      return (
        new Date(b.updated_at || b.created_at || '').getTime() -
        new Date(a.updated_at || a.created_at || '').getTime()
      );
    });
    this.conversations.set(sorted);
  }

  navigateBack(): void {
    this.router.navigate(['/projects']);
  }

  async openConversation(conv: ProjectConversation): Promise<void> {
    this.storage.setConversationId(conv.conversationID);
    this.initialConversationId.set(conv.conversationID);
    this.storage.removeForceNewChat();
    const p = this.project();
    if (p) {
      sessionStorage.setItem('kai_active_project_id', String(p.project_id));
      sessionStorage.setItem('kai_active_project_name', p.project_name);
      sessionStorage.setItem('kai_active_project_conversation_id', conv.conversationID);
    }

    // Try to fetch real conversation messages from the project history API
    let messages: any[] = [];
    try {
      if (p) {
        const res = await this.state.loadProjectConversationMessages(
          p.project_id,
          conv.conversationID
        );
        if (res?.conversation?.length > 0) {
          messages = [];
          for (const item of res.conversation) {
            messages.push({
              sender: 'user',
              message: item.question,
              responseType: item.responseType || 'text',
              status: 'completed',
              timestamp: item.timestamp
                ? new Date(item.timestamp.replace(/:/g, '-').replace(/-/g, (m: string, i: number) => i < 13 ? '-' : ':'))
                : new Date(),
            });
            if (item.response) {
              const rawResponse = typeof item.response === 'string'
                ? item.response
                : item.response?.response || '';
              messages.push({
                sender: 'bot',
                message: rawResponse,
                html: this.markdownService.formatMessageSync(rawResponse),
                responseType: item.responseType || 'text',
                status: 'completed',
                timestamp: item.timestamp
                  ? new Date(item.timestamp.replace(/:/g, '-').replace(/-/g, (m: string, i: number) => i < 13 ? '-' : ':'))
                  : new Date(),
                generated_image_ids: item.generated_image_ids,
                generated_document_ids: item.generated_document_ids,
                augSrc: item.augSrc,
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to load project conversation messages:', err);
    }

    const convPayload = {
      id: Date.now(),
      conversationID: conv.conversationID,
      title: conv.title,
      messages,
    };
    sessionStorage.setItem('kai_project_active_conv', JSON.stringify(convPayload));
    if (p) {
      this.router.navigate(['/projects', p.project_id, conv.conversationID]);
    } else {
      this.router.navigate(['/chatbot']);
    }
  }

  openContextMenu(conv: ProjectConversation, event: MouseEvent): void {
    event.stopPropagation();
    const btnRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.selectedConv.set(conv);
    
    const viewportHeight = window.innerHeight;
    const menuHeight = 190;
    const margin = 8;
    
    let top: string | null = `${btnRect.bottom + margin}px`;
    let bottom: string | null = null;
    let transformOrigin = 'top right';
    
    if (btnRect.bottom + menuHeight + margin > viewportHeight) {
      top = null;
      bottom = `${viewportHeight - btnRect.top + margin}px`;
      transformOrigin = 'bottom right';
    }

    this.menuPosition.set({
      position: 'fixed',
      top,
      bottom,
      right: `${window.innerWidth - btnRect.right}px`,
      left: null,
      'transform-origin': transformOrigin,
      'z-index': '10001',
    });
    this.contextMenuOpen.set(true);
  }

  closeContextMenu(): void {
    this.contextMenuOpen.set(false);
    this.selectedConv.set(null);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.contextMenuOpen()) return;
    const target = event.target as HTMLElement;
    if (!target.closest('app-chat-context-menu') && !target.closest('.options-btn')) {
      this.closeContextMenu();
    }
  }

  toggleModelDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isModelDropdownOpen.update((v) => !v);
  }

  readonly selectedModelValue = signal<string>('gpt-5.1');

  selectModel(model: any): void {
    const val = typeof model === 'string' ? model : model.value;
    const label = typeof model === 'string' ? model : model.label;
    this.selectedModelValue.set(val);
    this.selectedModelLabel.set(label);
    this.isModelDropdownOpen.set(false);
    const email = this.tokenService.getUserInfo()?.email || '';
    this.chatModelService.selectModel(val, email);
  }

  onMenuDelete(): void {
    const conv = this.selectedConv();
    if (!conv) {
      this.closeContextMenu();
      return;
    }
    this.convToDelete.set(conv);
    this.showConfirm.set(true);
    this.closeContextMenu();
  }

  cancelDelete(): void {
    this.showConfirm.set(false);
    this.convToDelete.set(null);
  }

  confirmDelete(): void {
    const conv = this.convToDelete();
    const p = this.project();
    if (!conv || !p) {
      this.cancelDelete();
      return;
    }

    this.chatApi.deleteChat({
      conversationID: conv.conversationID,
      project_id: p.project_id,
    }).subscribe({
      next: () => {
        this.conversations.update((list) =>
          list.filter((c) => c.conversationID !== conv.conversationID)
        );
        this.toastService.show('Conversation deleted successfully', 'success');
        this.cancelDelete();
      },
      error: (err) => {
        this.toastService.show('Failed to delete conversation', 'error');
        console.error('Failed to delete conversation:', err);
        this.cancelDelete();
      },
    });
  }

  onMenuShare(): void {
    const conv = this.selectedConv();
    const p = this.project();
    if (!conv || !p) {
      this.closeContextMenu();
      return;
    }

    this.convToShare.set(conv);
    this.shareTitle.set(conv.title || 'Conversation');
    this.showShareModal.set(true);
    this.shareLoading.set(true);
    this.shareUrl.set('');
    this.shareLinkCopied.set(false);
    this.shareConversationPairs.set([]);
    this.closeContextMenu();

    // 1. Load conversation messages for preview
    this.state.loadProjectConversationMessages(p.project_id, conv.conversationID)
      .then((res) => {
        if (res?.conversation && Array.isArray(res.conversation)) {
          const pairs = res.conversation
            .map((c: any) => {
              let answer = '';
              if (typeof c.response === 'string') {
                answer = c.response;
              } else if (c.response?.response) {
                answer = c.response.response;
              }
              return {
                question: c.question || '',
                answer,
              };
            })
            .filter((pair: any) => pair.question);
          this.shareConversationPairs.set(pairs);
        }
      })
      .catch((err) => {
        console.warn('Could not load messages for share preview:', err);
      });

    // 2. Call shareChat API
    const username = this.tokenService.getUserInfo()?.email || '';
    const payload = {
      conversationID: conv.conversationID,
      date_info: conv.created_at || new Date().toISOString(),
      user_string: username,
      bot_type: 'kumaran',
      project_id: p.project_id,
    };

    this.chatApi.shareChat(payload).subscribe({
      next: (res: any) => {
        this.shareLoading.set(false);
        const rawUrl =
          res?.url ||
          res?.share_link ||
          res?.link ||
          res?.share_url ||
          (typeof res === 'string' ? res : '');
        if (rawUrl) {
          const urlParts = rawUrl.trim().split('/');
          const token = urlParts[urlParts.length - 1];
          this.shareUrl.set(`${window.location.origin}/chatbot/s/${token}`);
        } else {
          this.shareUrl.set('');
        }
      },
      error: (err) => {
        this.shareLoading.set(false);
        this.shareUrl.set('');
        this.toastService.show('Failed to generate share link', 'error');
        console.error('Failed to share conversation:', err);
      },
    });
  }

  copyShareLink(): void {
    const url = this.shareUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => {
        this.shareLinkCopied.set(true);
        this.toastService.show('Link copied to clipboard!', 'success');
        setTimeout(() => this.shareLinkCopied.set(false), 2000);
      },
      () => {
        this.toastService.show('Failed to copy link', 'error');
      }
    );
  }

  closeShareModal(): void {
    this.showShareModal.set(false);
    this.shareUrl.set('');
    this.shareTitle.set('');
    this.shareConversationPairs.set([]);
    this.shareLinkCopied.set(false);
    this.convToShare.set(null);
  }

  openSocialShare(platform: string): void {
    const url = this.shareUrl();
    if (!url) return;
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(
      this.shareTitle() || 'Shared from KAI'
    );
    let socialUrl = '';
    switch (platform) {
      case 'teams':
        socialUrl = `https://teams.microsoft.com/share?href=${encodedUrl}&msgText=${encodedTitle}`;
        break;
      case 'outlook':
        socialUrl = `https://outlook.office.com/mail/deeplink/compose?subject=${encodedTitle}&body=${encodedUrl}`;
        break;
    }
    if (socialUrl) {
      window.open(
        socialUrl,
        '_blank',
        'noopener,noreferrer,width=600,height=500'
      );
    }
  }

  togglePin(conv: ProjectConversation, event: MouseEvent): void {
    event.stopPropagation();
    const p = this.project();
    if (!conv || !p) return;

    this.chatApi.pinChat(conv.conversationID, p.project_id).subscribe({
      next: () => {
        const updatedPin = !conv.is_pinned;
        const action = updatedPin ? 'pinned' : 'unpinned';
        this.conversations.update((list) => {
          const updated = list.map((c) =>
            c.conversationID === conv.conversationID
              ? { ...c, is_pinned: updatedPin }
              : c
          );
          return updated.sort((a, b) => {
            if (!!a.is_pinned !== !!b.is_pinned) {
              return a.is_pinned ? -1 : 1;
            }
            return (
              new Date(b.updated_at || b.created_at || '').getTime() -
              new Date(a.updated_at || a.created_at || '').getTime()
            );
          });
        });
        this.toastService.show(`Conversation ${action} successfully`, 'success');
      },
      error: (err) => {
        this.toastService.show('Failed to update pin status', 'error');
        console.error('Failed to pin conversation:', err);
      },
    });
  }

  onMenuPin(): void {
    const conv = this.selectedConv();
    const p = this.project();
    if (!conv || !p) {
      this.closeContextMenu();
      return;
    }

    this.chatApi.pinChat(conv.conversationID, p.project_id).subscribe({
      next: () => {
        const updatedPin = !conv.is_pinned;
        const action = updatedPin ? 'pinned' : 'unpinned';
        this.conversations.update((list) => {
          const updated = list.map((c) =>
            c.conversationID === conv.conversationID
              ? { ...c, is_pinned: updatedPin }
              : c
          );
          return updated.sort((a, b) => {
            if (!!a.is_pinned !== !!b.is_pinned) {
              return a.is_pinned ? -1 : 1;
            }
            return (
              new Date(b.updated_at || b.created_at || '').getTime() -
              new Date(a.updated_at || a.created_at || '').getTime()
            );
          });
        });
        this.toastService.show(`Conversation ${action} successfully`, 'success');
      },
      error: (err) => {
        this.toastService.show('Failed to update pin status', 'error');
        console.error('Failed to pin conversation:', err);
      },
    });
    this.closeContextMenu();
  }

  onMenuRename(): void {
    const conv = this.selectedConv();
    if (!conv) {
      this.closeContextMenu();
      return;
    }
    this.convToRename.set(conv);
    this.renameValue.set(conv.title || '');
    this.showRenameModal.set(true);
    this.closeContextMenu();
  }

  cancelRename(): void {
    this.showRenameModal.set(false);
    this.convToRename.set(null);
    this.renameValue.set('');
  }

  confirmRename(): void {
    const conv = this.convToRename();
    const p = this.project();
    const trimmed = this.renameValue().trim();
    if (!conv || !p || !trimmed) {
      this.cancelRename();
      return;
    }

    this.chatApi.renameChat({
      conversationID: conv.conversationID,
      conversationName: trimmed,
      project_id: p.project_id,
    }).subscribe({
      next: () => {
        this.conversations.update((list) =>
          list.map((c) =>
            c.conversationID === conv.conversationID
              ? { ...c, title: trimmed }
              : c
          )
        );
        this.toastService.show('Conversation renamed successfully', 'success');
        this.cancelRename();
      },
      error: (err) => {
        this.toastService.show('Failed to rename conversation', 'error');
        console.error('Failed to rename conversation:', err);
        this.cancelRename();
      },
    });
  }

  async onComposerMessage(event: { message: string; files?: any[] }): Promise<void> {
    const query = event.message?.trim() || '';
    const files = event.files || [];
    if (!query && files.length === 0) return;
    await this.submitPrompt(query, files);
  }

  async submitPrompt(customQuery?: string, customFiles?: any[]): Promise<void> {
    const query = (typeof customQuery === 'string' ? customQuery : this.inputPrompt()).trim();
    const files = customFiles || [];
    if (!query && files.length === 0) return;

    if (this.newChatPromise) {
      await this.newChatPromise;
    }
    const convId = this.initialConversationId() || this.storage.getConversationId() || `temp-${Date.now()}`;

    // Store pending prompt and project association
    sessionStorage.setItem('kai_pending_prompt', query);
    sessionStorage.setItem('kai_is_new_project_conversation', 'true');
    const p = this.project();
    if (p) {
      sessionStorage.setItem('kai_pending_project_id', String(p.project_id));
      sessionStorage.setItem('kai_pending_project_name', p.project_name);
      sessionStorage.setItem('kai_active_project_id', String(p.project_id));
      sessionStorage.setItem('kai_active_project_name', p.project_name);
      if (convId) {
        sessionStorage.setItem('kai_active_project_conversation_id', convId);
      }
    }

    if (files.length > 0) {
      if (this.chatFacade?.attachment) {
        this.chatFacade.attachment.pendingAttachments.set(files);
      }
      try {
        const serializableFiles = files.map((f: any) => ({
          name: f.name,
          size: f.size,
          previewUrl: f.previewUrl || null,
          uploaded: f.uploaded ?? true,
          uploading: false,
          progress: 100,
          docId: f.docId ?? null,
          exceeds_threshold: Boolean(f.exceeds_threshold),
          originalName: f.originalName || f.name,
        }));
        sessionStorage.setItem('kai_pending_attachments', JSON.stringify(serializableFiles));
      } catch (e) {
        console.warn('Failed to store pending attachments in sessionStorage', e);
      }
    } else {
      if (this.chatFacade?.attachment) {
        this.chatFacade.attachment.pendingAttachments.set([]);
      }
      sessionStorage.removeItem('kai_pending_attachments');
    }

    if (convId) {
      this.storage.setConversationId(convId);

      const convPayload = {
        id: Date.now(),
        conversationID: convId,
        title: query,
        messages: [],
      };
      sessionStorage.setItem('kai_project_active_conv', JSON.stringify(convPayload));
    }

    if (this.chatState) {
      let conv = this.chatState.currentConversation();
      if (!conv || conv.conversationID !== convId) {
        conv = this.chatState.createConversation(
          undefined,
          undefined,
          convId,
          true,
          p?.project_id,
        );
      }
      if (conv) {
        conv.is_project_chat = true;
        if (p) conv.project_id = p.project_id;
        if (convId.startsWith('temp-')) {
          conv.tempId = convId;
        } else {
          conv.conversationID = convId;
        }
      }
    }

    this.storage.removeForceNewChat();
    if (p && convId) {
      this.router.navigate(['/projects', p.project_id, convId]);
    } else {
      this.router.navigate(['/chatbot']);
    }
  }
}

