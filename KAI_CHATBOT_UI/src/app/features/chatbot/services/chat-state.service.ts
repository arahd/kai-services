import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ToastService } from '@core/services/toast.service';
import { ConfigService } from '@core/services/config.service';
import { ChatService } from '@features/chatbot/services/chat.service';

import { MarkdownService } from '@shared/services/markdown.service';
import { MessageFactoryService } from '@features/chatbot/services/message-factory.service';
import { ResponseMapperService } from '@features/chatbot/services/response-mapper.service';
import { StreamHandlerService } from '@features/chatbot/services/stream-handler.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { ChatErrorHandlerService } from '@core/services/error-handler.service';
import {
  ChatMessage,
  Conversation,
  FilePreview,
  SendMessagePayload,
  isProjectChat,
} from '@shared/models';

export interface ConversationInputState {
  inputMessage: string;
  files: FilePreview[];
  promptQueue: any[];
}

@Injectable({
  providedIn: 'root',
})
export class ChatStateService {
  private readonly chatApi = inject(ChatApiService);
  private readonly chatFacade = inject(ChatFacadeService);
  private readonly chatModelService = inject(ChatModelService);
  private readonly toastService = inject(ToastService);
  private readonly messageFactory = inject(MessageFactoryService);
  private readonly responseMapper = inject(ResponseMapperService);
  private readonly streamHandler = inject(StreamHandlerService);
  private readonly markdownService = inject(MarkdownService);
  private readonly chatService = inject(ChatService);
  private readonly storageService = inject(SessionStorageService);
  private readonly errorHandler = inject(ChatErrorHandlerService);
  private readonly router = inject(Router, { optional: true });

  readonly currentConversation = signal<Conversation | null>(null);

  private runChatSummarization(conversationID: string): Promise<any> {
    if (!conversationID) return Promise.resolve(null);
    return firstValueFrom(
      this.chatApi.chatSummarization({ conversationID }).pipe(
        catchError((err) => {
          console.error('chatSummarization failed:', err);
          return of(null);
        }),
      ),
    );
  }
  readonly conversations = signal<Conversation[]>([]);
  readonly currentLoadingMessage = signal<string>('Thinking...');
  readonly loadingElapsedSeconds = signal<number>(0);
  readonly loadingElapsedFormatted = computed(() => {
    const s = this.loadingElapsedSeconds();
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins === 0) {
      return `${secs}s`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  });
  readonly showLimitPopup = signal<boolean>(false);
  readonly showSessionExpiredPopup = signal<boolean>(false);
  readonly greetingFailed = signal<boolean>(false);

  readonly loadingMessages: string[] = [
    'Thinking...',
    'Analyzing your request...',
    'Consulting our digital resources...',
    'Formulating a response...',
    'Synthesizing insights...',
    'Refining details for you...',
    'Almost ready...',
  ];

  private currentRequestSubs: { [key: string]: Subscription } = {};
  private conversationStore = new Map<string, Conversation>();
  private readonly conversationInputStates = new Map<string, ConversationInputState>();
  private activeRequestIds: { [convKey: string]: string } = {};

  getConversationInputState(key: string): ConversationInputState {
    if (!key) return { inputMessage: '', files: [], promptQueue: [] };
    const saved = this.conversationInputStates.get(key);
    if (saved) return { ...saved };

    const conv =
      this.conversationStore.get(key) ||
      this.conversations().find((c) => this.getConvKey(c) === key);
    if (
      conv &&
      (conv.draftMessage ||
        (conv.draftAttachments && conv.draftAttachments.length > 0) ||
        (conv.draftQueue && conv.draftQueue.length > 0))
    ) {
      return {
        inputMessage: conv.draftMessage || '',
        files: conv.draftAttachments ? [...conv.draftAttachments] : [],
        promptQueue: conv.draftQueue ? [...conv.draftQueue] : [],
      };
    }

    return { inputMessage: '', files: [], promptQueue: [] };
  }

  saveConversationInputState(
    key: string,
    state: Partial<ConversationInputState>
  ): void {
    if (!key) return;
    const current = this.getConversationInputState(key);
    const updated: ConversationInputState = {
      inputMessage:
        state.inputMessage !== undefined
          ? state.inputMessage
          : current.inputMessage,
      files: state.files !== undefined ? [...state.files] : [...current.files],
      promptQueue:
        state.promptQueue !== undefined
          ? [...state.promptQueue]
          : [...current.promptQueue],
    };
    this.conversationInputStates.set(key, updated);

    const conv =
      this.conversationStore.get(key) ||
      this.conversations().find((c) => this.getConvKey(c) === key);
    if (conv) {
      conv.draftMessage = updated.inputMessage;
      conv.draftAttachments = updated.files;
      conv.draftQueue = updated.promptQueue;
    }
  }

  clearConversationInputState(key: string): void {
    if (!key) return;
    this.conversationInputStates.delete(key);
    const conv =
      this.conversationStore.get(key) ||
      this.conversations().find((c) => this.getConvKey(c) === key);
    if (conv) {
      conv.draftMessage = '';
      conv.draftAttachments = [];
      conv.draftQueue = [];
    }
  }
  private loadConversationId = 0;
  private greetingRetryCount = 0;
  private readonly MAX_GREETING_RETRIES = 2;
  private pendingMessage: { inputMessage: string; filePreviews: FilePreview[] } | null = null;
  private initialGreetingPromise: Promise<string | null> | null = null;

  user: any = {};
  userInfo: { name: string; email: string; avatar?: string } = {
    name: '',
    email: '',
  };

  getUserEmail(): string {
    return (
      this.user?.email ||
      this.userInfo?.email ||
      this.chatFacade.token.getUserInfo()?.email ||
      this.chatFacade.azureAd.getUserInfo()?.email ||
      ''
    );
  }

  private loadingIntervalId?: any;
  private generationStartTime: number | null = null;

  initConversation() {
    const parsed = this.chatFacade.token.getUserInfo();
    if (parsed) {
      this.user = parsed;
      this.userInfo.email = parsed.email;
      this.userInfo.name = parsed.name;
    }

    this.chatModelService.loadModels(this.userInfo.email);

    this.errorHandler.registerDelegate({
      showSessionExpiredPopup: this.showSessionExpiredPopup,
      showLimitPopup: this.showLimitPopup,
      resetGeneratingState: (convId: string) => {
        const cur = this.currentConversation();
        const keys = [
          convId,
          cur?.conversationID,
          cur?.tempId,
          cur?.id?.toString(),
        ].filter(Boolean);
        const states = this.chatFacade.history.generatingStates();
        for (const k of keys) {
          states[k!] = false;
        }
        if (typeof this.chatFacade.history.generatingStates?.set === 'function') {
          this.chatFacade.history.generatingStates.set({ ...states });
        }
      },
    });

    if (this.loadingIntervalId) {
      clearInterval(this.loadingIntervalId);
    }
    this.loadingIntervalId = setInterval(() => {
      const activeCID =
        this.currentConversation()?.conversationID ||
        this.currentConversation()?.id?.toString();
      if (activeCID && this.isChatGenerating(activeCID)) {
        if (!this.generationStartTime) {
          this.generationStartTime = Date.now();
        }
        const elapsed = Math.floor((Date.now() - this.generationStartTime) / 1000);
        this.loadingElapsedSeconds.set(elapsed);

        if (elapsed > 0 && elapsed % 3 === 0) {
          const currentIndex = this.loadingMessages.indexOf(
            this.currentLoadingMessage(),
          );
          const nextIndex = (currentIndex + 1) % this.loadingMessages.length;
          this.currentLoadingMessage.set(this.loadingMessages[nextIndex]);
        }
      } else {
        this.generationStartTime = null;
        this.loadingElapsedSeconds.set(0);
        this.currentLoadingMessage.set(this.loadingMessages[0]);
      }
    }, 1000);

    this.chatFacade.azureAd
      .getUserInfoObservable()
      .subscribe((userInfo: any) => {
        if (userInfo) {
          const emailChanged = this.userInfo.email !== userInfo.email;
          this.user = userInfo;
          this.userInfo.email = userInfo.email;
          this.userInfo.name = userInfo.name;
          if (emailChanged || (!this.chatModelService.models().length && !this.chatModelService.isLoadingModels())) {
            this.chatModelService.loadModels(userInfo.email);
          }

          const forceNewChat = this.storageService.getForceNewChat();

          const existingCID =
            this.storageService.getLastActiveConversationId() ||
            this.storageService.getConversationId();

          const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
          const isWelcomeRoute = currentPath === '/chatbot';

          if (forceNewChat || isWelcomeRoute) {
            this.storageService.removeConversationId();
            this.storageService.removeLastActiveConversationId();
            if (forceNewChat) this.storageService.removeForceNewChat();
            this.chatFacade.history.activeConversationID.set(null);
            this.createConversation();
            return;
          }

          if (existingCID) {
            this.chatFacade.history.activeConversationID.set(existingCID);
            this.storageService.setConversationId(existingCID);
            this.storageService.setLastActiveConversationId(existingCID);
          } else {
            this.currentConversation.set(null);
          }
        }
      });
  }

  destroyConversation() {
    if (this.loadingIntervalId) {
      clearInterval(this.loadingIntervalId);
    }
  }

  clearInvalidChat() {
    this.storageService.removeLastActiveConversationId();
    this.storageService.removeConversationId();
    this.chatFacade.history.activeConversationID.set(null);
    this.currentConversation.set(null);
  }

  createConversation(
    draftMessage?: string,
    draftAttachments?: FilePreview[],
    existingConversationId?: string | null,
    isProjectChat?: boolean,
    projectId?: string | number | null,
  ): Conversation {
    const targetConv = this.currentConversation();
    if (targetConv) {
      if (draftMessage !== undefined) {
        targetConv.draftMessage = draftMessage;
      }
      if (draftAttachments !== undefined) {
        targetConv.draftAttachments = draftAttachments;
      }
      const key = this.getConvKey(targetConv);
      this.conversationStore.set(key, targetConv);
      this.saveConversationInputState(key, {
        inputMessage: targetConv.draftMessage,
        files: targetConv.draftAttachments,
        promptQueue: targetConv.draftQueue,
      });
    }

    const isExistingReal = !!existingConversationId && !existingConversationId.startsWith('temp-');

    if (isExistingReal) {
      this.chatFacade.history.activeConversationID.set(existingConversationId!);
      this.storageService.setConversationId(existingConversationId!);
      this.chatFacade.history.activeTempId.set(null);
    } else {
      this.chatFacade.history.activeConversationID.set(null);
      this.storageService.removeConversationId();
      this.storageService.removeLastActiveConversationId();

      const tempId =
        existingConversationId && existingConversationId.startsWith('temp-')
          ? existingConversationId
          : 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      this.chatFacade.history.activeTempId.set(tempId);
    }

    // Reset greeting state for the new chat
    this.greetingFailed.set(false);
    this.greetingRetryCount = 0;
    this.pendingMessage = null;

    // Unlock model so user can choose before the new conversation starts
    this.chatModelService.unlockModel();

    // Create fresh conversation container immediately with tempId or existingConversationId
    const newConv: Conversation = {
      id: Date.now(),
      title: 'New Chat',
      messages: [],
      conversationID: isExistingReal ? existingConversationId! : undefined,
      tempId: isExistingReal ? undefined : (this.chatFacade.history.activeTempId() || undefined),
      is_project_chat: isProjectChat ?? false,
      project_id: projectId ?? undefined,
    };
    const newKey = this.getConvKey(newConv);
    const existingDraft = this.getConversationInputState(newKey);
    if (
      existingDraft &&
      (existingDraft.inputMessage ||
        existingDraft.files.length > 0 ||
        existingDraft.promptQueue.length > 0)
    ) {
      newConv.draftMessage = existingDraft.inputMessage;
      newConv.draftAttachments = existingDraft.files;
      newConv.draftQueue = existingDraft.promptQueue;
    }
    this.conversations.set([...this.conversations(), newConv]);
    this.currentConversation.set(newConv);

    if (isExistingReal) {
      this.initialGreetingPromise = Promise.resolve(existingConversationId);
    } else {
      this.sendInitialGreeting();
    }
    return newConv;
  }

  retryGreeting() {
    this.greetingRetryCount = 0;
    this.greetingFailed.set(false);
    this.sendInitialGreeting();
  }

  private sendInitialGreeting() {
    let newConv = this.currentConversation();
    if (newConv?.conversationID && !newConv.conversationID.startsWith('temp-')) {
      return;
    }
    if (!newConv || (newConv.messages && newConv.messages.length > 0)) {
      const currentConvs = this.conversations();
      const tempId =
        this.chatFacade.history.activeTempId() ||
        'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      newConv = {
        id: Date.now(),
        title: 'New Chat',
        messages: [],
        tempId,
      };
      this.conversations.set([...currentConvs, newConv]);
      this.currentConversation.set(newConv);
    }

    const payload: SendMessagePayload = {
      language_type: 'en',
      query: 'Hi',
      bot_type: 'kumaran',
      userId: this.getUserEmail(),
      project_id: sessionStorage.getItem('kai_active_project_id') || null,
    };

    // Ensure pre-fetching greeting never locks user-facing composer
    const convKey = newConv.conversationID || newConv.tempId || newConv.id.toString();
    this.chatFacade.history.generatingStates()[convKey] = false;

    this.initialGreetingPromise = new Promise<string | null>((resolve) => {
      this.chatApi.sendMessage(payload).subscribe({
        next: (res: any) => {
          this.greetingFailed.set(false);
          this.greetingRetryCount = 0;

          const convId =
            res.conversationID ||
            this.chatFacade.history.activeConversationID() ||
            '';
          if (convId) {
            this.chatFacade.history.generatingStates()[convId] = false;
            this.chatFacade.history.conversationStatuses()[convId] = 'new';
          }

          if (res.conversationID) {
            const oldTempId = newConv?.tempId;
            newConv!.conversationID = res.conversationID;
            if (oldTempId) {
              this.chatFacade.attachment.migrateUploadedDocsCache?.(oldTempId, res.conversationID);
            }
            this.chatFacade.history.activeConversationID.set(res.conversationID);
            this.storageService.setConversationId(res.conversationID);
            this.chatFacade.history.activeTempId.set(null);

            const currentTarget = this.currentConversation();
            if (
              currentTarget &&
              (currentTarget === newConv || currentTarget.tempId === newConv!.tempId)
            ) {
              currentTarget.conversationID = res.conversationID;
              this.currentConversation.set({ ...currentTarget });
              this.chatService.updateDraftConversation(currentTarget);

              // If active route is currently a tempId, upgrade URL to real conversation ID
              if (this.router && this.router.url.includes('/chatbot/temp-')) {
                this.router.navigate(['/chatbot', res.conversationID], { replaceUrl: true });
              }
            }
          }

          if (this.pendingMessage) {
            const pending = this.pendingMessage;
            this.pendingMessage = null;
            setTimeout(() => this.sendMessage(pending.inputMessage, pending.filePreviews), 0);
          }

          resolve(res.conversationID || null);
        },
        error: (err) => {
          console.error('Initial greeting failed:', err);
          const convId =
            this.chatFacade.history.activeConversationID() || 'initial';
          this.chatFacade.history.generatingStates()[convId] = false;

          if (err.status === 419) {
            this.showSessionExpiredPopup.set(true);
            resolve(null);
            return;
          } else if (err.status === 519) {
            this.showLimitPopup.set(true);
            resolve(null);
            return;
          }

          this.greetingRetryCount++;
          if (this.greetingRetryCount <= this.MAX_GREETING_RETRIES) {
            console.warn(
              `Retrying initial greeting (${this.greetingRetryCount}/${this.MAX_GREETING_RETRIES})...`,
            );
            setTimeout(() => this.sendInitialGreeting(), 2000);
            resolve(null);
            return;
          }

          this.greetingFailed.set(true);
          this.pendingMessage = null;
          resolve(null);
        },
      });
    });
  }

  sendMessage(inputMessage: string, filePreviews: FilePreview[]) {
    let targetConv = this.currentConversation();
    if (
      (!inputMessage.trim() && filePreviews.length === 0) ||
      this.chatFacade.attachment.isFileUploading()
    ) {
      return;
    }

    // If starting fresh on /chatbot, create the initial conversation container
    if (!targetConv) {
      const tempId =
        this.chatFacade.history.activeTempId() ||
        'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      targetConv = {
        id: Date.now(),
        title: inputMessage.trim().slice(0, 30) || 'New Chat',
        messages: [],
        tempId,
      };
      this.chatFacade.history.activeTempId.set(tempId);
      this.conversations.set([...this.conversations(), targetConv]);
      this.currentConversation.set(targetConv);
    }

    const attachments = [...filePreviews];
    const userMessage: ChatMessage = this.messageFactory.createUserMessage(
      inputMessage,
      attachments,
    );
    const normalizedMessage = userMessage.message;

    const convId = targetConv.conversationID || targetConv.id.toString();
    this.chatFacade.history.generatingStates()[convId] = true;
    if (targetConv.tempId) {
      this.chatFacade.history.generatingStates()[targetConv.tempId] = true;
    }
    if (targetConv.id) {
      this.chatFacade.history.generatingStates()[targetConv.id.toString()] = true;
    }
    if (this.chatFacade.history.conversationStatuses()[convId] !== 'saved') {
      this.chatFacade.history.conversationStatuses()[convId] = 'generating';
    }

    // Clear suggestions and retry from all previous bot messages
    targetConv.messages.forEach((m) => {
      if (m.sender === 'bot') {
        m.suggestions = [];
        m.canRetry = false;
      }
    });

    targetConv.messages.push(userMessage);
    targetConv.conversationID =
      this.chatFacade.history.activeConversationID() ||
      targetConv.conversationID ||
      this.storageService.getConversationId() ||
      undefined;

    const tempId = this.chatFacade.history.activeTempId();
    if (tempId && !targetConv.conversationID) {
      targetConv.tempId = tempId;
    }

    this.currentConversation.set({ ...targetConv });
    this.clearConversationInputState(this.getConvKey(targetConv));
    targetConv.draftMessage = '';
    targetConv.draftAttachments = [];
    targetConv.draftQueue = [];

    const isProject =
      isProjectChat(targetConv) ||
      (this.router?.url && this.router.url.includes('projects')) ||
      !!sessionStorage.getItem('kai_active_project_id') ||
      !!sessionStorage.getItem('kai_pending_project_id');

    if (!isProject) {
      if (targetConv.messages.length === 1) {
        this.storageService.setConversationId(
          this.chatFacade.history.activeConversationID() || '',
        );
        this.chatService.sendFirstQuestion(normalizedMessage);
      }
      this.chatService.updateDraftConversation(targetConv);
    }

    // Lock the model on user message so it can't be changed mid-conversation
    const currentModel = this.chatModelService.modelLocked()
      ? (targetConv.lockedModel || this.chatModelService.selectedModel())
      : this.chatModelService.selectedModel();

    targetConv.lockedModel = currentModel;
    this.chatModelService.lockModel(currentModel);

    // Register model in conversation map if conversationID is already available
    if (targetConv.conversationID && currentModel) {
      this.chatModelService.setModelForConversation(targetConv.conversationID, currentModel);
    }

    this.sendToBot(normalizedMessage, attachments);
  }

  private isCurrentConversation(targetConv: Conversation): boolean {
    const active = this.currentConversation();
    if (!active) return false;
    if (active === targetConv) return true;
    if (
      active.conversationID &&
      active.conversationID === targetConv.conversationID
    )
      return true;
    if (active.tempId && active.tempId === targetConv.tempId) return true;
    return false;
  }

  private async sendToBot(message: string, attachments: FilePreview[]) {
    const targetConv = this.currentConversation();
    if (!targetConv) return;

    const activeModel = targetConv.lockedModel || this.chatModelService.selectedModel();
    targetConv.lockedModel = activeModel;

    let cid =
      this.chatFacade.history.activeConversationID() ||
      targetConv.conversationID ||
      this.storageService.getConversationId() ||
      null;

    // If greeting is currently in flight, wait up to 2.5s for its conversationID
    if (!cid && this.initialGreetingPromise) {
      try {
        const preId = await Promise.race([
          this.initialGreetingPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]);
        if (preId) {
          cid = preId;
          targetConv.conversationID = preId;
        }
      } catch (e) {
        // proceed with null
      }
    }

    const convId = cid || targetConv.tempId || targetConv.id.toString();
    const payload: SendMessagePayload = {
      language_type: 'en',
      query: message,
      bot_type: 'kumaran',
      userId: this.getUserEmail(),
      model: activeModel,
      conversationID: cid,
      project_id: sessionStorage.getItem('kai_active_project_id') || null,
      is_stream: !!this.chatFacade.history.streaming(),
      is_from_upload: attachments.length > 0,
      uploaded_doc_ids: attachments
        .map((f: any) => f.docId)
        .filter((id: any) => id != null),
      uploaded_file_names: attachments.map((f: any) => f.name),
      exceeds_threshold: attachments.map((f: any) => Boolean(f.exceeds_threshold)),
    };

    // Attach existing document metadata from previously uploaded files in this conversation
    const existingData = this.chatFacade.attachment.getExistingDocumentsData(
      cid,
      targetConv.tempId,
      payload.uploaded_doc_ids,
      payload.uploaded_file_names,
      targetConv,
    );
    if (existingData && existingData.existing_filenames && existingData.existing_filenames.length > 0) {
      payload.existing_filenames = existingData.existing_filenames;
      payload.existing_doc_ids = existingData.existing_doc_ids;
      payload.existing_threshold = existingData.existing_threshold;
    }

    // Record the current attachments for this conversation so subsequent queries include them
    if (attachments.length > 0) {
      this.chatFacade.attachment.addUploadedDocuments?.(convId, attachments);
      if (cid && cid !== convId) {
        this.chatFacade.attachment.addUploadedDocuments?.(cid, attachments);
      }
    }

    this.chatFacade.history.generatingStates()[convId] = true;
    this.generationStartTime = Date.now();
    this.loadingElapsedSeconds.set(0);
    this.currentLoadingMessage.set('Thinking...');
    this.conversationStore.set(convId, targetConv);

    let summarizationPromise: Promise<any> | null = null;
    const startSummarization = (cidToSummarize: string) => {
      if (!cidToSummarize || summarizationPromise) return;
      summarizationPromise = this.runChatSummarization(cidToSummarize);
    };

    if (payload.conversationID) {
      startSummarization(payload.conversationID);
    }

    if (this.chatFacade.history.streaming()) {
      this.streamHandler.handleStreamingResponse(
        payload,
        targetConv,
        convId,
        this.activeRequestIds,
        this.currentRequestSubs,
        this.conversationStore,
        (conv) => {
          if (this.isCurrentConversation(conv)) {
            this.currentConversation.set({ ...conv });
          }
        },
        async (conv) => {
          const isProject =
            isProjectChat(conv) ||
            (this.router?.url && this.router.url.includes('projects')) ||
            !!sessionStorage.getItem('kai_active_project_id');
          if (!isProject) {
            this.chatService.updateDraftConversation(conv);
          }
          if (conv.conversationID) {
            startSummarization(conv.conversationID);
            if (this.router) {
              if (this.router.url.includes('/projects/')) {
                const pid = conv.project_id || sessionStorage.getItem('kai_active_project_id');
                if (pid) {
                  this.storageService.setConversationId(conv.conversationID);
                  this.storageService.setLastActiveConversationId(conv.conversationID);
                  sessionStorage.setItem('kai_active_project_conversation_id', conv.conversationID);
                  this.router.navigate(['/projects', pid, conv.conversationID], { replaceUrl: true });
                }
              } else if (this.router.url.includes('/chatbot/temp-')) {
                this.router.navigate(['/chatbot', conv.conversationID], { replaceUrl: true });
              }
            }
          }
          await this.fetchSuggestions(conv);
          if (conv.conversationID) {
            if (summarizationPromise) {
              await summarizationPromise;
            }
            await this.endChat(conv.conversationID);
          }
        },
        (conv) => this.isCurrentConversation(conv),
      );
      return;
    }

    const sub = this.chatApi.sendMessage(payload).subscribe({
      next: async (res: any) => {
        const activeConv = this.currentConversation();
        if (!activeConv) return;

        if (res.conversationID) {
          const oldTempId = targetConv.tempId;
          targetConv.conversationID = res.conversationID;
          targetConv.lockedModel = activeModel;
          if (oldTempId) {
            this.chatFacade.attachment.migrateUploadedDocsCache?.(oldTempId, res.conversationID);
          }
          startSummarization(res.conversationID);
          if (this.isCurrentConversation(targetConv)) {
            this.chatFacade.history.activeConversationID.set(
              res.conversationID || null,
            );
            this.storageService.setConversationId(res.conversationID);
            if (this.chatFacade.history.activeTempId()) {
              this.chatFacade.history.activeTempId.set(null);
            }
            this.chatModelService.lockModel(activeModel);

            if (this.router) {
              if (this.router.url.includes('/projects/')) {
                const pid = targetConv.project_id || sessionStorage.getItem('kai_active_project_id');
                if (pid) {
                  this.storageService.setConversationId(res.conversationID);
                  this.storageService.setLastActiveConversationId(res.conversationID);
                  sessionStorage.setItem('kai_active_project_conversation_id', res.conversationID);
                  this.router.navigate(['/projects', pid, res.conversationID], { replaceUrl: true });
                }
              } else if (this.router.url.includes('/chatbot/temp-')) {
                this.router.navigate(['/chatbot', res.conversationID], { replaceUrl: true });
              }
            }
          }

          if (activeModel) {
            this.chatModelService.setModelForConversation(res.conversationID, activeModel);
          }
        }

        const formattedResult = await this.responseMapper.formatMessage(
          res,
          res.responseType,
        );
        const images = this.responseMapper.extractImages(res);
        const documents = this.responseMapper.extractDocuments(res);

        const botReply: ChatMessage = {
          sender: 'bot',
          role: 'assistant',
          type:
            documents.length > 0
              ? 'document'
              : images.length > 0
                ? 'image'
                : 'text',
          content: formattedResult.finalText,
          message: formattedResult.finalText,
          html: formattedResult.formattedMessage,
          timestamp: new Date(),
          responseType: res.responseType,
          augSrc: res.augSrc ?? [],
          images: images.length > 0 ? images : undefined,
          imageUrl: images.length > 0 ? images[0].url : undefined,
          documents: documents.length > 0 ? documents : undefined,
          status: 'completed',
          isPlaceholder: false,
        };

        if (res.augSrc?.length) {
          targetConv.augSrc = res.augSrc;
        }

        targetConv.messages.push(botReply);
        const lastUserMsg = targetConv.messages
          .filter((m) => m.sender === 'user')
          .slice(-1)[0];
        if (lastUserMsg) lastUserMsg.botResponseComplete = true;

        if (this.isCurrentConversation(targetConv)) {
          this.currentConversation.set({ ...targetConv });
        }
        const isProject =
          isProjectChat(targetConv) ||
          (this.router?.url && this.router.url.includes('projects')) ||
          !!sessionStorage.getItem('kai_active_project_id');
        if (!isProject) {
          this.chatService.updateDraftConversation(targetConv);
        }


      },
      error: (error) => {
        const keys = [
          convId,
          targetConv.conversationID,
          targetConv.tempId,
          targetConv.id ? targetConv.id.toString() : undefined,
        ].filter((k): k is string => Boolean(k));
        const states = this.chatFacade.history.generatingStates();
        for (const k of keys) {
          states[k] = false;
          delete this.activeRequestIds[k];
          if (this.currentRequestSubs[k]) {
            this.currentRequestSubs[k].unsubscribe();
            delete this.currentRequestSubs[k];
          }
        }
        if (typeof this.chatFacade.history.generatingStates?.set === 'function') {
          this.chatFacade.history.generatingStates.set({ ...states });
        }

        if (error.status === 419) {
          this.showSessionExpiredPopup.set(true);
          return;
        }
        if (error.status === 519) {
          this.showLimitPopup.set(true);
          return;
        }
        if (error.status === 413) {
          const errText = error?.error?.error || 'Query Exceeds input limit for the current model';
          const errorMessage = this.messageFactory.createErrorMessage(errText);
          targetConv.messages.push(errorMessage);
          if (this.isCurrentConversation(targetConv)) {
            this.currentConversation.set({ ...targetConv });
          }
          return;
        }
      
        const errorMessage = this.messageFactory.createErrorMessage();
        targetConv.messages.push(errorMessage);
        if (this.isCurrentConversation(targetConv)) {
          this.currentConversation.set({ ...targetConv });
        }
      },
      complete: async () => {
        delete this.currentRequestSubs[convId];
        if (targetConv.conversationID) {
          startSummarization(targetConv.conversationID);
        }
        await this.fetchSuggestions(targetConv);
        if (targetConv.conversationID) {
          if (summarizationPromise) {
            await summarizationPromise;
          }
          await this.endChat(targetConv.conversationID);
        }
        // Only clear generating state AFTER endChat completes
        this.chatFacade.history.generatingStates()[convId] = false;
        if (targetConv.conversationID) {
          this.chatFacade.history.generatingStates()[targetConv.conversationID] = false;
        }
        if (targetConv.tempId) {
          this.chatFacade.history.generatingStates()[targetConv.tempId] = false;
        }
        if (targetConv.id) {
          this.chatFacade.history.generatingStates()[targetConv.id.toString()] = false;
        }
        if (typeof this.chatFacade.history.generatingStates?.set === 'function') {
          this.chatFacade.history.generatingStates.set({ ...this.chatFacade.history.generatingStates() });
        }
      },
    });
    this.currentRequestSubs[convId] = sub;
  }

  private escapeHtml(s: string): string {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  cancelGeneration() {
    const current = this.currentConversation();
    if (!current) return;
    const convId = current.conversationID || current.id.toString();

    const keysToCancel = [
      convId,
      current.conversationID || '',
      current.id.toString(),
      current.tempId || '',
    ].filter(Boolean);

    const states = this.chatFacade.history.generatingStates();
    for (const key of keysToCancel) {
      if (this.currentRequestSubs[key]) {
        this.currentRequestSubs[key].unsubscribe();
        delete this.currentRequestSubs[key];
      }
      states[key] = false;
      delete this.activeRequestIds[key];
    }
    if (typeof this.chatFacade.history.generatingStates?.set === 'function') {
      this.chatFacade.history.generatingStates.set({ ...states });
    }

    const cancelMsg = this.messageFactory.createCancelledMessage();
    current.messages.push(cancelMsg);
    current.conversationID =
      this.chatFacade.history.activeConversationID() || undefined;

    this.currentConversation.set({ ...current });
  }

  isChatGenerating(convId?: string): boolean {
    if (!convId) return false;
    const states = this.chatFacade.history.generatingStates();
    const cur = this.currentConversation();

    const targetConv =
      cur && (cur.conversationID === convId || cur.tempId === convId || cur.id?.toString() === convId)
        ? cur
        : this.conversationStore.get(convId) ||
          this.conversations().find((c) => c.conversationID === convId || c.tempId === convId || c.id?.toString() === convId);

    // If the conversation's last message is a completed, failed, or cancelled bot message,
    // it is no longer generating — but only if the generating state is not explicitly held true
    // (e.g., while endChat is still in progress for completed messages).
    if (targetConv && targetConv.messages && targetConv.messages.length > 0) {
      const lastMsg = targetConv.messages[targetConv.messages.length - 1];
      if (
        lastMsg.sender === 'bot' &&
        (lastMsg.status === 'failed' || lastMsg.status === 'error') &&
        !lastMsg.isPlaceholder
      ) {
        const keys = [
          convId,
          targetConv.conversationID,
          targetConv.tempId,
          targetConv.id?.toString(),
        ].filter(Boolean);

        let changed = false;
        for (const k of keys) {
          if (states[k!]) {
            states[k!] = false;
            changed = true;
          }
        }
        if (changed && typeof this.chatFacade.history.generatingStates?.set === 'function') {
          this.chatFacade.history.generatingStates.set({ ...states });
        }
        return false;
      }

      if (
        lastMsg.sender === 'bot' &&
        lastMsg.status === 'completed' &&
        !lastMsg.isPlaceholder
      ) {
        // Check if ANY key still has generating state explicitly set to true
        const keys = [
          convId,
          targetConv.conversationID,
          targetConv.tempId,
          targetConv.id?.toString(),
        ].filter(Boolean);

        const anyExplicitlyTrue = keys.some((k) => states[k!] === true);
        if (anyExplicitlyTrue) {
          // endChat is still in progress — keep isGenerating true
          return true;
        }

        return false;
      }
    }

    if (states[convId]) return true;
    if (targetConv) {
      if (targetConv.conversationID && states[targetConv.conversationID]) return true;
      if (targetConv.tempId && states[targetConv.tempId]) return true;
      if (targetConv.id && states[targetConv.id.toString()]) return true;
    }
    return false;
  }

  shouldShowSkeleton(
    conv: Conversation | null = this.currentConversation(),
  ): boolean {
    if (!conv) return false;
    const convId = conv.conversationID || conv.tempId || conv.id.toString();
    if (!this.isChatGenerating(convId)) {
      return false;
    }
    if (conv.messages.length === 0) {
      return true;
    }
    const lastMsg = conv.messages[conv.messages.length - 1];
    if (lastMsg.sender === 'user') {
      return true;
    }
    if (lastMsg.sender === 'bot' && !lastMsg.message && !lastMsg.html) {
      return true;
    }
    return false;
  }

  /**
   * Checks if a conversation exists in memory (cached or actively generating).
   */
  hasInMemoryConversation(convId?: string): boolean {
    if (!convId) return false;
    if (this.isChatGenerating(convId)) return true;
    const cached =
      this.conversationStore.get(convId) ||
      this.conversations().find(
        (c) =>
          c.conversationID === convId ||
          c.tempId === convId ||
          c.id?.toString() === convId
      );
    return Boolean(
      cached && (cached.messages?.length > 0 || this.isChatGenerating(convId))
    );
  }

  /**
   * Restores an in-flight or cached conversation from memory as currentConversation
   * without triggering an API call.
   */
  restoreFromMemory(convId?: string): boolean {
    if (!convId) return false;
    const cached =
      this.conversationStore.get(convId) ||
      this.conversations().find(
        (c) =>
          c.conversationID === convId ||
          c.tempId === convId ||
          c.id?.toString() === convId
      );

    if (cached) {
      this.currentConversation.set(cached);
      this.chatFacade.history.activeConversationID.set(
        cached.conversationID || null
      );
      if (cached.conversationID) {
        this.storageService.setConversationId(cached.conversationID);
        this.storageService.setLastActiveConversationId(cached.conversationID);
      }
      return true;
    }
    return false;
  }

  private getConvKey(conv: Conversation): string {
    return conv.conversationID || conv.id.toString();
  }

  private endChat(conversationID: string): Promise<void> {
    if (!conversationID) return Promise.resolve();

    const endPayload = {
      conversationID: conversationID,
      bot_type: 'kumaran',
    };
    if (
      this.chatFacade.history.conversationStatuses()[conversationID] !== 'saved'
    ) {
      this.chatFacade.history.conversationStatuses()[conversationID] = 'saving';
    }
    return firstValueFrom(
      this.chatApi.endChat(endPayload).pipe(
        catchError((err) => {
          console.error('Failed to end chat:', err);
          if (
            this.chatFacade.history.conversationStatuses()[conversationID] !==
            'saved'
          ) {
            this.chatFacade.history.conversationStatuses()[conversationID] =
              'failed';
          }
          return of(null);
        }),
      ),
    ).then((result) => {
      if (result !== null) {
        this.chatFacade.history.conversationStatuses()[conversationID] =
          'saved';
      }
    });
  }

  private fetchHistoricalImages(
    conversationId: string,
    messageIndex: number,
    imageIds: string[],
  ) {
    if (!conversationId || !this.currentConversation()) return;

    imageIds.forEach((imageId) => {
      const payload = {
        conversation_id: conversationId,
        image_id: imageId,
      };

      this.chatApi.getGeneratedImage(payload).subscribe({
        next: (res: any) => {
          const target = this.currentConversation();
          if (!target || target.conversationID !== conversationId) return;

          const msg = target.messages[messageIndex];
          if (!msg) return;

          const images = this.responseMapper.extractImages(res);
          if (images.length > 0) {
            msg.images = [...(msg.images || []), ...images];
          }

          msg.isImageLoading = false;
          msg.imageLoadError = msg.images!.length === 0;

          this.currentConversation.set({ ...target });
        },
        error: (err) => {
          console.error(`Failed to fetch image ${imageId}:`, err);
          const target = this.currentConversation();
          if (
            target &&
            target.conversationID === conversationId &&
            target.messages[messageIndex]
          ) {
            const msg = target.messages[messageIndex];
            msg.isImageLoading = false;
            msg.imageLoadError = true;
            this.currentConversation.set({ ...target });
          }
        },
      });
    });
  }

  private fetchHistoricalDocuments(
    conversationId: string,
    messageIndex: number,
    documentIds: string[],
  ) {
    if (!conversationId || !this.currentConversation()) return;

    documentIds.forEach((documentId) => {
      const payload = {
        conversation_id: conversationId,
        generated_document_id: documentId,
      };

      this.chatApi.getGeneratedDocument(payload).subscribe({
        next: (res: any) => {
          const target = this.currentConversation();
          if (!target || target.conversationID !== conversationId) return;

          const msg = target.messages[messageIndex];
          if (!msg) return;

          const documents = this.responseMapper.extractDocuments(res);
          if (documents.length > 0) {
            msg.documents = [...(msg.documents || []), ...documents];
          }

          msg.isDocumentLoading = false;
          msg.documentLoadError = msg.documents!.length === 0;

          this.currentConversation.set({ ...target });
        },
        error: (err) => {
          console.error(`Failed to fetch document ${documentId}:`, err);
          const target = this.currentConversation();
          if (
            target &&
            target.conversationID === conversationId &&
            target.messages[messageIndex]
          ) {
            const msg = target.messages[messageIndex];
            msg.isDocumentLoading = false;
            msg.documentLoadError = true;
            this.currentConversation.set({ ...target });
          }
        },
      });
    });
  }

  fetchSuggestions(targetConv: Conversation): Promise<void> {
    return new Promise<void>((resolve) => {
      const payload = {
        conversationID:
          targetConv.conversationID || this.storageService.getConversationId(),
      };

      this.chatApi.getSuggestions(payload as any).subscribe({
        next: (res: any) => {
          const questions: string[] = res.follow_up_questions || [];
          const lastBot = [...targetConv.messages]
            .reverse()
            .find((m) => m.sender === 'bot');
          if (lastBot) {
            lastBot.suggestions = questions;
            if (this.isCurrentConversation(targetConv)) {
              this.currentConversation.set({ ...targetConv });
            }
          }
          resolve();
        },
        error: (err) => {
          console.error('Failed to fetch suggestions', err);
          resolve();
        },
      });
    });
  }

  parseMessageTimestamp(value: any): Date {
    if (!value) return new Date();
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? new Date() : value;
    }

    if (typeof value === 'string') {
      let s = value.trim();

      if (/^\d{4}:\d{2}:\d{2}:\d{2}:\d{2}:\d{2}$/.test(s)) {
        const [y, mo, d, h, mi, se] = s.split(':').map((x) => Number(x));
        const local = new Date(
          y,
          (mo || 1) - 1,
          d || 1,
          h || 0,
          mi || 0,
          se || 0,
        );
        return Number.isNaN(local.getTime()) ? new Date() : local;
      }

      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(s)) {
        s = s.replace(' ', 'T');
      }

      s = s.replace(/\.(\d{3})\d+([Z+\-])/, '.$1$2');

      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? new Date() : d;
    }

    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  async loadConversationData(
    chat: any,
    draftMessage?: string,
    draftAttachments?: FilePreview[],
    scrollToQuestion?: string,
  ) {
    const targetConv = this.currentConversation();
    if (
      targetConv &&
      chat?.conversationID &&
      this.getConvKey(targetConv) !== chat.conversationID
    ) {
      if (draftMessage !== undefined) {
        targetConv.draftMessage = draftMessage;
      }
      if (draftAttachments !== undefined) {
        targetConv.draftAttachments = draftAttachments;
      }
      const outgoingKey = this.getConvKey(targetConv);
      this.conversationStore.set(outgoingKey, targetConv);
      this.saveConversationInputState(outgoingKey, {
        inputMessage: targetConv.draftMessage,
        files: targetConv.draftAttachments,
        promptQueue: targetConv.draftQueue,
      });
    }

    this.chatFacade.history.activeTempId.set(null);

    const loadId = ++this.loadConversationId;

    if (chat && chat.conversation) {
      if (chat.conversationID) {
        this.chatFacade.history.conversationStatuses()[chat.conversationID] =
          'saved';
        this.chatFacade.history.generatingStates()[chat.conversationID] = false;
        if (chat.id) {
          this.chatFacade.history.generatingStates()[chat.id.toString()] = false;
        }
        if (chat.tempId) {
          this.chatFacade.history.generatingStates()[chat.tempId] = false;
        }
        const cached = this.conversationStore.get(chat.conversationID);
        if (cached && Array.isArray(cached.messages) && cached.messages.length > 0) {
          const savedDraft = this.getConversationInputState(chat.conversationID);
          if (savedDraft) {
            cached.draftMessage = savedDraft.inputMessage;
            cached.draftAttachments = savedDraft.files;
            cached.draftQueue = savedDraft.promptQueue;
          }
          this.currentConversation.set(cached);
          this.chatFacade.history.activeConversationID.set(
            chat.conversationID || null,
          );
          this.storageService.setConversationId(chat.conversationID);
          (cached as any).conversationID = chat.conversationID;

          // Lock model to what was used in this conversation
          const cachedModel =
            (cached as any)?.lockedModel ||
            chat?.lockedModel ||
            chat?.model_name ||
            chat?.model ||
            chat?.gpt_model_name ||
            (chat?.conversationID ? this.chatModelService.getModelForConversation(chat.conversationID) : null);

          const hasUserMsgs = Array.isArray((cached as any)?.messages) && (cached as any).messages.some((m: any) => m.sender === 'user');

          if (cachedModel) {
            this.chatModelService.lockModel(cachedModel);
            (cached as any).lockedModel = cachedModel;
            if (chat.conversationID) {
              this.chatModelService.setModelForConversation(chat.conversationID, cachedModel);
            }
          } else if (hasUserMsgs) {
            const defaultModel = this.chatModelService.models().find(m => m.isDefault)?.value || 'gpt-4o-mini';
            this.chatModelService.lockModel(defaultModel);
            (cached as any).lockedModel = defaultModel;
            if (chat.conversationID) {
              this.chatModelService.setModelForConversation(chat.conversationID, defaultModel);
            }
          } else {
            this.chatModelService.unlockModel();
          }

          const hasUploadedFiles = Array.isArray((cached as any)?.messages) &&
            (cached as any).messages.some((m: any) => Array.isArray(m.attachments) && m.attachments.length > 0);

          if (chat.conversationID && hasUploadedFiles) {
            this.fetchUploadedDocumentsForConversation(chat.conversationID, cached);
          }

          return cached;
        }
      }

      const incomingKey = chat.conversationID || (chat.id ? chat.id.toString() : '');
      const savedDraft = incomingKey ? this.getConversationInputState(incomingKey) : null;

      const tempConv: Conversation = {
        id: chat.id || Date.now(),
        title: chat.greetings || chat.conversationName || 'Previous Chat',
        messages: [],
        conversationID: chat.conversationID || undefined,
        is_project_chat: chat.is_project_chat || !!chat.project_id,
        project_id: chat.project_id,
        draftMessage: savedDraft?.inputMessage || '',
        draftAttachments: savedDraft?.files || [],
        draftQueue: savedDraft?.promptQueue || [],
      };

      const imagesToFetch: { idx: number; ids: string[] }[] = [];
      const documentsToFetch: { idx: number; ids: string[] }[] = [];
      let messageIndex = 0;

      for (const c of chat.conversation) {
        if (this.loadConversationId !== loadId) return null;

        const userMsgHasImages = c.cached_user_images?.length > 0;
        const loadedAttachments: FilePreview[] = [];
        if (Array.isArray(c.uploaded_files) && c.uploaded_files.length > 0) {
          c.uploaded_files.forEach((fileName: string) => {
            loadedAttachments.push({
              file: null as any,
              name: fileName,
              size: 0,
              uploading: false,
              progress: 100,
              uploaded: true,
              error: null,
            });
          });
        }

        tempConv.messages.push({
          sender: 'user',
          role: 'user',
          type: userMsgHasImages ? 'image' : 'text',
          content: c?.question,
          message: c?.question,
          html: c?.question,
          timestamp: this.parseMessageTimestamp(c?.timestamp),
          responseType: '',
          botResponseComplete: true,
          images: userMsgHasImages ? c.cached_user_images : [],
          imageUrl: userMsgHasImages ? c.cached_user_images[0].url : undefined,
          status: 'completed',
          isPlaceholder: false,
          attachments: loadedAttachments,
          canCollapse: c?.question ? c.question.length > 300 : false,
          collapsed: c?.question ? c.question.length > 300 : false,
        });
        messageIndex++;

        let rawBotText = '';
        const hasGeneratedImages =
          Array.isArray(c.generated_image_ids) &&
          c.generated_image_ids.length > 0;
        const hasGeneratedDocuments =
          Array.isArray(c.generated_document_ids) &&
          c.generated_document_ids.length > 0;
        if (typeof c.response === 'string') {
          rawBotText = c.response;
        } else if (c.response?.response) {
          rawBotText = c.response.response;
        } else if (!hasGeneratedImages && !hasGeneratedDocuments) {
          rawBotText = 'No response from bot';
        }

        rawBotText = rawBotText
          .replace(/<KUMARAN_GENERATED_IMAGE>.*?<\/KUMARAN_GENERATED_IMAGE>/gs, '')
          .replace(/<KUMARAN_GENERATED_DOCUMENT>.*?<\/KUMARAN_GENERATED_DOCUMENT>/gs, '')
          .replace(/<KUMARAN_CHAT_HISTORY_FAILED>.*?<\/KUMARAN_CHAT_HISTORY_FAILED>/gs, '')
          .trim();

        let formattedHtml = rawBotText;
        try {
          formattedHtml = await this.markdownService.formatMessage(rawBotText);
        } catch (err) {
          console.error('Markdown parse failed', err);
        }

        if (this.loadConversationId !== loadId) return null;

        formattedHtml = formattedHtml
          .replace(/&lt;KUMARAN_GENERATED_IMAGE&gt;.*?&lt;\/KUMARAN_GENERATED_IMAGE&gt;/gs, '')
          .replace(/&lt;KUMARAN_GENERATED_DOCUMENT&gt;.*?&lt;\/KUMARAN_GENERATED_DOCUMENT&gt;/gs, '')
          .replace(/&lt;KUMARAN_CHAT_HISTORY_FAILED&gt;.*?&lt;\/KUMARAN_CHAT_HISTORY_FAILED&gt;/gs, '');

        const hasCachedImages =
          Array.isArray(c.cached_images) && c.cached_images.length > 0;
        const hasCachedDocuments =
          Array.isArray(c.cached_documents) && c.cached_documents.length > 0;
        if (hasGeneratedImages && !hasCachedImages) {
          imagesToFetch.push({ idx: messageIndex, ids: c.generated_image_ids });
        }
        if (hasGeneratedDocuments && !hasCachedDocuments) {
          documentsToFetch.push({
            idx: messageIndex,
            ids: c.generated_document_ids,
          });
        }

        tempConv.messages.push({
          sender: 'bot',
          role: 'assistant',
          type: hasGeneratedDocuments
            ? 'document'
            : hasGeneratedImages
              ? 'image'
              : 'text',
          content: rawBotText,
          message: rawBotText,
          html: formattedHtml || undefined,
          timestamp: this.parseMessageTimestamp(c?.timestamp),
          responseType: c?.responseType,
          generated_image_ids: hasGeneratedImages
            ? c.generated_image_ids
            : undefined,
          isImageLoading: hasGeneratedImages && !hasCachedImages,
          imageLoadError: false,
          images: hasCachedImages ? c.cached_images : [],
          imageUrl:
            hasCachedImages && c.cached_images[0]
              ? c.cached_images[0].url
              : undefined,
          generated_document_ids: hasGeneratedDocuments
            ? c.generated_document_ids
            : undefined,
          isDocumentLoading: hasGeneratedDocuments && !hasCachedDocuments,
          documentLoadError: false,
          documents: hasCachedDocuments ? c.cached_documents : [],
          status: 'completed',
          isPlaceholder: false,
          suggestions: Array.isArray(c.suggestions) ? c.suggestions : [],
        });
        messageIndex++;
      }

      this.currentConversation.set(tempConv);
      this.chatFacade.history.activeConversationID.set(
        chat.conversationID || null,
      );
      tempConv.conversationID = chat.conversationID || undefined;
      if (chat.conversationID) {
        this.chatFacade.history.generatingStates()[chat.conversationID] = false;
      }
      if (tempConv.id) {
        this.chatFacade.history.generatingStates()[tempConv.id.toString()] = false;
      }

      // Lock the model to what was used in this historical conversation
      const historicalModel =
        tempConv.lockedModel ||
        chat?.lockedModel ||
        chat?.model_name ||
        chat?.model ||
        chat?.gpt_model_name ||
        (chat?.conversationID ? this.chatModelService.getModelForConversation(chat.conversationID) : null);

      const hasUserMsgs = (Array.isArray(tempConv.messages) && tempConv.messages.some((m: any) => m.sender === 'user')) || (Array.isArray(chat?.conversation) && chat.conversation.length > 0);

      if (historicalModel) {
        this.chatModelService.lockModel(historicalModel);
        tempConv.lockedModel = historicalModel;
        if (chat.conversationID) {
          this.chatModelService.setModelForConversation(chat.conversationID, historicalModel);
        }
      } else if (hasUserMsgs) {
        const defaultModel = this.chatModelService.models().find(m => m.isDefault)?.value || 'gpt-4o-mini';
        this.chatModelService.lockModel(defaultModel);
        tempConv.lockedModel = defaultModel;
        if (chat.conversationID) {
          this.chatModelService.setModelForConversation(chat.conversationID, defaultModel);
        }
      } else {
        this.chatModelService.unlockModel();
      }

      if (chat.conversationID) {
        this.conversationStore.set(chat.conversationID, tempConv);
      }

      if (imagesToFetch.length > 0) {
        imagesToFetch.forEach((item) => {
          this.fetchHistoricalImages(chat.conversationID, item.idx, item.ids);
        });
      }

      if (documentsToFetch.length > 0) {
        documentsToFetch.forEach((item) => {
          this.fetchHistoricalDocuments(
            chat.conversationID,
            item.idx,
            item.ids,
          );
        });
      }

      const hasUploadedFiles = tempConv.messages.some(
        (m) => Array.isArray(m.attachments) && m.attachments.length > 0
      );

      if (chat.conversationID && hasUploadedFiles) {
        this.fetchUploadedDocumentsForConversation(chat.conversationID, tempConv);
      }

      return tempConv;
    }
    return null;
  }

  private fetchUploadedDocumentsForConversation(conversationId: string, targetConv: Conversation) {
    if (!conversationId || !targetConv) return;

    this.chatFacade.attachment.loadUploadedDocumentsForConversation(conversationId).subscribe({
      next: (uploadedDocs: FilePreview[]) => {
        if (!uploadedDocs || uploadedDocs.length === 0) return;

        const active = this.currentConversation();
        if (!active || (active.conversationID !== conversationId && active.id !== targetConv.id)) return;

        let updated = false;

        targetConv.messages.forEach((msg) => {
          if (msg.sender === 'user') {
            if (msg.attachments && msg.attachments.length > 0) {
              msg.attachments = msg.attachments.map((existing) => {
                const matched = uploadedDocs.find(
                  (ud) => ud.name === existing.name || (ud.originalName && ud.originalName === existing.name)
                );
                if (matched && matched.previewUrl) {
                  updated = true;
                  return { ...existing, previewUrl: matched.previewUrl };
                }
                return existing;
              });
            }
          }
        });

        if (updated) {
          this.currentConversation.set({ ...targetConv });
        }
      },
      error: (err) => {
        console.warn(`[ChatStateService] Failed to load uploaded documents for ${conversationId}:`, err);
      }
    });
  }

  retryMessage(failedMsgIndex: number) {
    const targetConv = this.currentConversation();
    if (!targetConv) return;

    const failedMsg = targetConv.messages[failedMsgIndex];
    if (
      !failedMsg ||
      failedMsg.sender !== 'bot' ||
      failedMsg.status !== 'failed' ||
      failedMsg.canRetry === false ||
      failedMsgIndex !== targetConv.messages.length - 1
    ) {
      return;
    }

    // Find the nearest user message before this failed message
    let userMsgIndex = -1;
    for (let i = failedMsgIndex - 1; i >= 0; i--) {
      if (targetConv.messages[i].sender === 'user') {
        userMsgIndex = i;
        break;
      }
    }

    if (userMsgIndex === -1) return;
    const userMsg = targetConv.messages[userMsgIndex];

    // Remove only the failed bot message; keep the user question intact in the conversation
    targetConv.messages.splice(failedMsgIndex, 1);

    // Set generating states for the retry
    const convId = targetConv.conversationID || targetConv.id.toString();
    this.chatFacade.history.generatingStates()[convId] = true;
    if (this.chatFacade.history.conversationStatuses()[convId] !== 'saved') {
      this.chatFacade.history.conversationStatuses()[convId] = 'generating';
    }

    // Update conversation signal
    this.currentConversation.set({ ...targetConv });

    // Send the user query to the bot again
    this.sendToBot(userMsg.message, userMsg.attachments || []);
  }
}
