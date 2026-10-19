import { Injectable, signal, computed, inject } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { SidenavCacheService } from '@features/sidenav/sidenav-cache.service';
import { ToastService } from '@core/services/toast.service';
import { Router } from '@angular/router';
import { isProjectChat } from '@shared/models';

@Injectable({
  providedIn: 'root'
})
export class ChatHistoryStateService {
  private readonly chatService = inject(ChatService);
  private readonly chatApi = inject(ChatApiService);
  private readonly cache = inject(SidenavCacheService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  // Core Sidenav/Chatbot shared states
  readonly chats = signal<any[]>([]);
  readonly activeConversationID = signal<string | null>(null);
  readonly activeTempId = signal<string | null>(null);
  readonly generatingStates = signal<{ [key: string]: boolean }>({});
  readonly conversationStatuses = signal<{ [key: string]: 'new' | 'generating' | 'saving' | 'saved' | 'failed' }>({});

  // Pagination states
  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(0);
  readonly loadingChats = signal<boolean>(false);
  readonly hasMore = signal<boolean>(true);
  readonly limit = 20;

  // Search states
  readonly searchText = signal<string>('');
  readonly searchResults = signal<any[]>([]);
  readonly isSearchLoading = signal<boolean>(false);

  // Settings states
  readonly streaming = signal<boolean>(false);
  readonly showHistorySection = signal<boolean>(true);

  // Derived / helper values
  readonly isFileUploading = signal<boolean>(false);

  constructor() {
    // Sync activeTempId from ChatService subscription (if updated elsewhere)
    this.chatService.activeTempId$.subscribe((tempId: string | null) => {
 // perf-ignore
      this.activeTempId.set(tempId);
    });

    // Sync draft conversation updates
    this.chatService.draftConv$.subscribe((conv: any) => {
 // perf-ignore
      if (!conv || !conv.messages || conv.messages.length === 0) return;

      const isProject =
        (this.router.url && this.router.url.includes('projects')) ||
        isProjectChat(conv) ||
        !!sessionStorage.getItem('kai_active_project_id') ||
        !!sessionStorage.getItem('kai_pending_project_id');
      if (isProject) return;

      const mapped: any[] = [];
      const msgs = conv.messages;
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].sender === 'user') {
          const question = msgs[i].message;
          let response = '';
          let generated_image_ids;
          let cached_images;
          let generated_document_ids;
          let cached_documents;
          if (i + 1 < msgs.length && msgs[i + 1].sender === 'bot') {
            response = msgs[i + 1].message;
            generated_image_ids = msgs[i + 1].generated_image_ids;
            cached_images = msgs[i + 1].images;
            generated_document_ids = msgs[i + 1].generated_document_ids;
            cached_documents = msgs[i + 1].documents;
          }
          mapped.push({
            question,
            response,
            generated_image_ids,
            cached_images,
            generated_document_ids,
            cached_documents,
          });
        }
      }

      const convTempId = conv.tempId || null;
      let matchIndex = -1;
      const currentChats = this.chats();

      if (conv.conversationID) {
        matchIndex = currentChats.findIndex(
          (c: any) => c.conversationID === conv.conversationID
        );
      }
      if (matchIndex === -1 && convTempId) {
        matchIndex = currentChats.findIndex(
          (c: any) => c.tempId && c.tempId === convTempId
        );
      }

      if (matchIndex !== -1) {
        const existingChat = currentChats[matchIndex];
        const updatedChat = {
          ...existingChat,
          conversation: mapped,
          greetings: existingChat.greetings || conv.title || 'New Chat',
          conversationID: conv.conversationID || existingChat.conversationID || null,
          tempId: conv.conversationID ? null : existingChat.tempId || convTempId,
          startTime: existingChat.startTime || new Date().toISOString(),
          lockedModel: conv.lockedModel || existingChat.lockedModel,
        };

        const nextChats = [...currentChats];
        nextChats[matchIndex] = updatedChat;
        this.chats.set(nextChats);

        if (conv.conversationID && existingChat.tempId) {
          this.activeConversationID.set(conv.conversationID);
          this.activeTempId.set(null);
        }
      } else {
        const newEntry: any = {
          conversation: mapped,
          conversationID: conv.conversationID || null,
          tempId: conv.conversationID ? null : convTempId,
          greetings: conv.title || 'New Chat',
          startTime: new Date().toISOString(),
          lockedModel: conv.lockedModel,
        };
        this.chats.set([newEntry, ...currentChats]);

        if (conv.conversationID) {
          this.activeConversationID.set(conv.conversationID);
          this.activeTempId.set(null);
        }
      }
    });
  }

  isChatbotActive(): boolean {
    try {
      const url = this.router.url || '';
      const path = url.split('?')[0];
      return (
        path === '/chatbot' ||
        path.startsWith('/chatbot/') ||
        path === '/projects' ||
        path.startsWith('/projects/')
      );
    } catch {
      return false;
    }
  }

  syncCache(userEmail: string | null) {
    this.cache.set({
      userEmail,
      chats: this.chats(),
      activeConversationID: this.activeConversationID(),
      currentPage: this.currentPage(),
      totalPages: this.totalPages(),
      showHistorySection: this.showHistorySection(),
      updatedAt: Date.now(),
    });
  }

  resetChatsAndLoad(userEmail: string, isSilent = false) {
    if (!this.isChatbotActive()) return;
    this.currentPage.set(1);
    this.totalPages.set(0);
    this.hasMore.set(true);
    if (!isSilent) {
      this.chats.set([]);
    }
    this.loadChats(userEmail, isSilent, true, undefined, 1);
  }

  loadChats(
    userEmail: string,
    isSilent = false,
    preserveActive = true,
    onChatSelected?: (chat: any) => void,
    pageToLoad?: number,
    onComplete?: () => void
  ) {
    if (!this.isChatbotActive()) return;
    if (!userEmail || this.loadingChats()) {
      onComplete?.();
      return;
    }

    const requestedPage = pageToLoad ?? (this.currentPage() || 1);

    if (requestedPage > 1 && !this.hasMore()) {
      onComplete?.();
      return;
    }

    this.loadingChats.set(true);

    const payload = {
      user_string: userEmail,
      bot_type: 'kumaran',
    };

    this.chatService
      .getNewChatHistoryList(payload, requestedPage, this.limit)
      .subscribe({
        // perf-ignore
        next: (res: any) => {
          this.loadingChats.set(false);

          let conversationsOnly: any[] = [];
          let metaTotalPages: number | undefined;

          if (res) {
            if (Array.isArray(res)) {
              for (const item of res) {
                if (item && typeof item === 'object') {
                  if (item.totalPages !== undefined) {
                    metaTotalPages = Number(item.totalPages);
                  } else if (item.total_pages !== undefined) {
                    metaTotalPages = Number(item.total_pages);
                  }
                  if (item.conversationID && !isProjectChat(item)) {
                    conversationsOnly.push(item);
                  }
                }
              }
            } else if (typeof res === 'object') {
              if (res.totalPages !== undefined) {
                metaTotalPages = Number(res.totalPages);
              } else if (res.total_pages !== undefined) {
                metaTotalPages = Number(res.total_pages);
              }
              const potentialLists = [
                res.conversations,
                res.chats,
                res.data,
                res.history,
                res.chat_history,
                res.items,
              ];
              const foundList = potentialLists.find((l) => Array.isArray(l));
              if (foundList) {
                conversationsOnly = foundList.filter(
                  (chat: any) =>
                    chat &&
                    chat.conversationID &&
                    !isProjectChat(chat)
                );
              }
            }
          }

          if (metaTotalPages !== undefined && !isNaN(metaTotalPages)) {
            this.totalPages.set(metaTotalPages);
          }

          const formattedChats = conversationsOnly.map((chat: any) => ({
            ...chat,
            displayTitle:
              chat.conversationName ||
              chat.conversation?.[0]?.question ||
              'Untitled',
            lockedModel:
              chat.lockedModel ||
              chat.model_name ||
              chat.model ||
              chat.gpt_model_name,
            conversation: chat.conversation || [],
          }));

          const savedActiveID = preserveActive ? this.activeConversationID() : null;

          if (requestedPage === 1) {
            this.chats.set(formattedChats);
            this.currentPage.set(2);
          } else {
            const currentChats = [...this.chats()];
            for (const fc of formattedChats) {
              const existsIndex = currentChats.findIndex((c: any) => {
                if (fc.conversationID && c.conversationID)
                  return c.conversationID === fc.conversationID;
                return false;
              });

              if (existsIndex === -1) {
                currentChats.push(fc);
              } else {
                currentChats[existsIndex] = {
                  ...currentChats[existsIndex],
                  ...fc,
                };
              }
            }
            this.chats.set(currentChats);
            this.currentPage.set(requestedPage + 1);
          }

          // Strict pagination based on totalPages
          if (this.totalPages() > 0) {
            this.hasMore.set(this.currentPage() <= this.totalPages());
          } else {
            this.hasMore.set(conversationsOnly.length > 0);
          }

          this.sortChats();
          this.syncCache(userEmail);

          if (preserveActive && savedActiveID) {
            this.activeConversationID.set(savedActiveID);
            const activeChatObj = this.chats().find(
              (c) => c.conversationID === savedActiveID
            );
            if (activeChatObj && onChatSelected) {
              onChatSelected(activeChatObj);
            }
          }

          onComplete?.();
        },
        error: (err) => {
          this.loadingChats.set(false);
          console.error('Failed to load chats:', err);
          onComplete?.();
        },
      });
  }

  /**
   * Loads a conversation by conversationID stored in session storage.
   * Replaces legacy getPageByConversationID flow.
   * Loads the sidebar history list and fetches the full conversation via POST /chat/history/conversation.
   */
  loadConversationByConversationID(
    userEmail: string,
    conversationID: string,
    onChatSelected?: (chat: any) => void,
    onInvalid?: () => void
  ) {
    if (!this.isChatbotActive()) return;

    this.activeConversationID.set(conversationID);
    this.activeTempId.set(null);

    // 1. Load the history list
    this.loadChats(userEmail, false, true);

    // Guard: skip API fetch while the conversation is still generating
    if (this.generatingStates()[conversationID]) {
      if (onChatSelected) {
        const existing = this.chats().find((c) => c.conversationID === conversationID);
        onChatSelected({ ...(existing || {}), conversationID, _fromMemory: true });
      }
      return;
    }

    // 2. Fetch the full conversation messages from API based on conversationID
    this.loadConversationMessages(
      userEmail,
      conversationID,
      (fullChat) => {
        if (onChatSelected) {
          onChatSelected(fullChat);
        }
      },
      (err) => {
        console.error('Failed to load conversation for ID:', conversationID, err);
        if (onInvalid) {
          onInvalid();
        }
      }
    );
  }

  loadSidebarPageByConversationID(
    userEmail: string,
    conversationID: string,
    onChatSelected?: (chat: any) => void,
    onInvalid?: () => void
  ) {
    this.loadConversationByConversationID(
      userEmail,
      conversationID,
      onChatSelected,
      onInvalid
    );
  }

  loadHistoryPagesUpTo(userEmail: string, targetPage: number, preserveActive = true, onChatSelected?: (chat: any) => void) {
    if (!this.isChatbotActive()) return;
    if (!userEmail || this.loadingChats()) return;

    this.loadingChats.set(true);

    // With the new API we load the full list in one call;
    // targetPage is used only to set the pagination cursor afterwards.
    const payload = {
      user_string: userEmail,
      bot_type: 'kumaran',
    };

    this.chatService.getNewChatHistoryList(payload, targetPage, this.limit).subscribe({
 // perf-ignore
      next: (res: any) => {
        this.loadingChats.set(false);

        let allResults: any[] = [];
        let newTotalPages = this.totalPages();

        if (res && Array.isArray(res) && res.length > 0) {
          const meta = res.find((x: any) => x.totalPages !== undefined);
          if (meta) newTotalPages = meta.totalPages;

          const conversationsOnly = res.filter(
            (chat: any) => chat.conversationID && !isProjectChat(chat)
          );

          allResults = conversationsOnly.map((chat: any) => ({
            ...chat,
            displayTitle: chat.conversationName || chat.conversation?.[0]?.question || 'Untitled',
            lockedModel: chat.lockedModel || chat.model_name || chat.model || chat.gpt_model_name,
            conversation: chat.conversation || [],
          }));
        }

        const uniqueResults: any[] = [];
        const seenIds = new Set();
        for (const chat of allResults) {
          const id = chat.conversationID;
          if (id && !seenIds.has(id)) {
            seenIds.add(id);
            uniqueResults.push(chat);
          }
        }

        this.chats.set(uniqueResults);
        this.totalPages.set(newTotalPages);
        this.currentPage.set(targetPage + 1);
        this.sortChats();
        this.syncCache(userEmail);

        const savedActiveID = preserveActive ? this.activeConversationID() : null;
        if (preserveActive && savedActiveID) {
          this.activeConversationID.set(savedActiveID);
          const activeChatObj = this.chats().find(
            (c) => c.conversationID === savedActiveID
          );
          if (activeChatObj && onChatSelected) {
            onChatSelected(activeChatObj);
          }
        }
      },
      error: (err) => {
        this.loadingChats.set(false);
        this.currentPage.set(targetPage);
        console.error('Failed to load history pages:', err);
      }
    });
  }

  sortChats(): void {
    const sorted = [...this.chats()].sort((a, b) => {
      const aPinned = !!a.is_pinned;
      const bPinned = !!b.is_pinned;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
    this.chats.set(sorted);
  }

  /**
   * Lazily loads full conversation messages for a chat item.
   * Uses POST /chat/history/conversation endpoint.
   * Returns the conversation response with full messages.
   */
  loadConversationMessages(
    userEmail: string,
    conversationID: string,
    onLoaded?: (chat: any) => void,
    onError?: (err: any) => void
  ): void {
    // Guard: skip API fetch while the conversation is still generating
    if (this.generatingStates()[conversationID]) {
      if (onLoaded) {
        const existing = this.chats().find((c) => c.conversationID === conversationID);
        onLoaded({ ...(existing || {}), conversationID, _fromMemory: true });
      }
      return;
    }

    const payload = {
      user_string: userEmail,
      bot_type: 'kumaran',
      conversation_id: conversationID,
    };

    this.chatApi.getNewChatHistoryConversation(payload).subscribe({
      // perf-ignore
      next: (res: any) => {
        if (res && res.conversation) {
          let found = false;
          // Update the chat in the list with the loaded messages
          const updatedChats = this.chats().map((chat) => {
            if (chat.conversationID === conversationID) {
              found = true;
              return {
                ...chat,
                conversation: res.conversation,
                conversationName: res.conversationName || chat.conversationName,
                greetings: res.greetings || chat.greetings,
                is_pinned: res.is_pinned ?? chat.is_pinned,
              };
            }
            return chat;
          });

          if (!found && res.conversationID) {
            const isProject =
              (this.router.url && this.router.url.includes('projects')) ||
              res.project_id ||
              res.is_project_chat;
            if (!isProject) {
              updatedChats.unshift({
                ...res,
                displayTitle: res.conversationName || res.conversation?.[0]?.question || 'Untitled',
                lockedModel: res.gpt_model_name || res.model_name || res.model,
                conversation: res.conversation || [],
              });
            }
          }

          this.chats.set(updatedChats);

          if (onLoaded) {
            const updated = updatedChats.find(
              (c) => c.conversationID === conversationID
            );
            onLoaded(updated || res);
          }
        } else if (onLoaded) {
          onLoaded(res);
        }
      },
      error: (err) => {
        console.error('Failed to load conversation messages:', err);
        if (onError) onError(err);
      },
    });
  }

  pinChat(index: number, userEmail: string): void {
    const selectedChat = this.chats()[index];
    if (!selectedChat?.conversationID) return;

    this.chatService.pinChat(selectedChat.conversationID, selectedChat.project_id).subscribe({
 // perf-ignore
      next: () => {
        const updatedPinnedState = !selectedChat.is_pinned;
        const action = updatedPinnedState ? 'pinned' : 'unpinned';

        const updated = this.chats().map((chatItem) =>
          chatItem.conversationID === selectedChat.conversationID
            ? { ...chatItem, is_pinned: updatedPinnedState }
            : chatItem
        );
        this.chats.set(updated);
        this.sortChats();
        this.syncCache(userEmail);

        this.toastService.show(`Conversation ${action} successfully`, 'success');
      },
      error: () => {
        this.toastService.show('Failed to update pin status', 'error');
      },
    });
  }

  deleteChat(index: number, userEmail: string, onActiveDeleted: () => void): void {
    const currentChat = this.chats()[index];
    if (!currentChat?.conversationID) return;

    const deletePayload: any = {
      conversationID: currentChat.conversationID,
    };
    if (currentChat.project_id != null) {
      deletePayload.project_id = currentChat.project_id;
    }

    this.chatService.deleteChat(deletePayload).subscribe({
 // perf-ignore
      next: () => {
        const activeID = this.activeConversationID();
        const isDeletingActive = currentChat.conversationID === activeID;

        const updated = this.chats().filter(
          (chat) => chat.conversationID !== currentChat.conversationID
        );
        this.chats.set(updated);
        this.syncCache(userEmail);

        this.toastService.show('Conversation deleted successfully', 'success');

        if (isDeletingActive) {
          onActiveDeleted();
        }
      },
      error: (err: any) => {
        this.toastService.show('Failed to delete conversation', 'error');
        console.error('Failed to delete chat:', err);
      },
    });
  }

  renameChat(index: number, newName: string, userEmail: string): void {
    const currentChat = this.chats()[index];
    if (!currentChat?.conversationID || !newName.trim()) return;

    const payload: any = {
      conversationID: currentChat.conversationID,
      conversationName: newName.trim(),
    };
    if (currentChat.project_id != null) {
      payload.project_id = currentChat.project_id;
    }

    this.chatService.renameChat(payload).subscribe({
 // perf-ignore
      next: () => {
        const updated = [...this.chats()];
        updated[index] = {
          ...updated[index],
          conversationName: newName.trim()
        };
        this.chats.set(updated);
        this.syncCache(userEmail);

        this.toastService.show('Conversation renamed successfully', 'success');
      },
      error: (err: any) => {
        this.toastService.show('Failed to rename conversation', 'error');
        console.error('Failed to rename chat:', err);
      },
    });
  }

  searchChat(userEmail: string) {
    const query = this.searchText().trim();
    if (!query) {
      this.searchResults.set([]);
      return;
    }

    this.isSearchLoading.set(true);
    const payload = {
      user_string: userEmail,
      query,
    };

    this.chatService.searchChat(payload).subscribe({
 // perf-ignore
      next: (res) => {
        const convResults = (res?.conversation_search || []).map((r: any) => ({
          ...r,
          _searchCategory: 'conversation' as const,
        }));
        const qResults = (res?.question_search || []).map((r: any) => ({
          ...r,
          _searchCategory: 'question' as const,
        }));
        this.searchResults.set([...convResults, ...qResults]);
        this.isSearchLoading.set(false);
      },
      error: (err) => {
        console.error('search error:', err);
        this.isSearchLoading.set(false);
      },
    });
  }
}
