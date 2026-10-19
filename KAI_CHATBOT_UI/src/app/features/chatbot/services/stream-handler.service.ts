import { Injectable, inject, Injector } from '@angular/core';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { MessageFactoryService } from '@features/chatbot/services/message-factory.service';
import { ResponseMapperService } from '@features/chatbot/services/response-mapper.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import {
  parseStreamLine,
} from '@features/chatbot/utils/stream.utils';
import { Conversation } from '@shared/models';
import { MarkdownService } from '@shared/services/markdown.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { Subscription } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class StreamHandlerService {
  private chatApi = inject(ChatApiService);
  private messageFactory = inject(MessageFactoryService);
  private responseMapper = inject(ResponseMapperService);
  private markdownService = inject(MarkdownService);
  private chatFacade = inject(ChatFacadeService);
  private chatModelService = inject(ChatModelService);
  private storageService = inject(SessionStorageService);
  private injector = inject(Injector);

  private escapeHtml(s: string): string {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private getOpenFenceLang(text: string): string | null {
    const fenceRegex = /```(\w+)?/g;
    let openLang: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = fenceRegex.exec(text))) {
      if (openLang === null) {
        openLang = (m[1] || '').trim() || 'plaintext';
      } else {
        openLang = null; // close fence
      }
    }
    return openLang;
  }

  handleStreamingResponse(
    payload: any,
    targetConv: Conversation,
    convId: string,
    activeRequestIds: { [convKey: string]: string },
    currentRequestSubs: { [key: string]: Subscription },
    conversationStore: Map<string, Conversation>,
    updateStateCallback: (conv: Conversation) => void,
    onCompleteCallback: (conv: Conversation) => Promise<void> | void,
    isActiveCallback: (conv: Conversation) => boolean,
  ) {
    this.chatFacade.history.generatingStates()[convId] = true;
    if (targetConv.tempId) {
      this.chatFacade.history.generatingStates()[targetConv.tempId] = true;
    }
    if (targetConv.id) {
      this.chatFacade.history.generatingStates()[targetConv.id.toString()] = true;
    }
    if (targetConv.conversationID) {
      this.chatFacade.history.generatingStates()[targetConv.conversationID] = true;
    }

    const streamModel = targetConv.lockedModel || payload.model || this.chatModelService.selectedModel();
    targetConv.lockedModel = streamModel;

    const requestId = `${convId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeRequestIds[convId] = requestId;

    conversationStore.set(convId, targetConv);

    const botReply = this.messageFactory.createBotPlaceholder();

    let hasPushedReply = false;
    const ensurePushed = () => {
      if (!hasPushedReply) {
        targetConv.messages.push(botReply);
        hasPushedReply = true;
        updateStateCallback(targetConv);
      }
    };

    const CARET = `<span class="typing-caret">▋</span>`;
    const caretOff = (html: string) =>
      html.replace(/<span class="typing-caret">▋<\/span>$/, '');

    let currentKey = convId;
    let targetText = '';
    let displayedText = '';
    let isStreamComplete = false;
    let isRendering = false;
    let isMappedResponseHandled = false;
    let typingLoopActive = true;
    let lastTypedAt = performance.now();

    const clearAllGeneratingStates = () => {
      typingLoopActive = false;
      const keysToClear = [
        currentKey,
        convId,
        targetConv.conversationID,
        targetConv.tempId,
        targetConv.id ? targetConv.id.toString() : undefined,
      ].filter((k): k is string => Boolean(k));

      const states = this.chatFacade.history.generatingStates();
      for (const k of keysToClear) {
        states[k] = false;
        delete activeRequestIds[k];
        if (currentRequestSubs && currentRequestSubs[k]) {
          currentRequestSubs[k].unsubscribe();
          delete currentRequestSubs[k];
        }
        if (
          typeof this.chatFacade.history.conversationStatuses === 'function' &&
          this.chatFacade.history.conversationStatuses()[k] === 'generating'
        ) {
          this.chatFacade.history.conversationStatuses()[k] = 'saved';
        }
      }
      if (typeof this.chatFacade.history.generatingStates?.set === 'function') {
        this.chatFacade.history.generatingStates.set({ ...states });
      }
    };

    const finalizeResponse = async () => {
      if (isMappedResponseHandled) {
        clearAllGeneratingStates();
        botReply.status = 'completed';
        return;
      }

      botReply.message = targetText;
      botReply.content = botReply.message;

      const finalOpenLang = this.getOpenFenceLang(targetText);
      if (finalOpenLang !== null) {
        botReply.message += '\n```';
        botReply.content += '\n```';
      }

      botReply.message = this.responseMapper.cleanSystemTags(botReply.message);

      let finalHtml = await this.markdownService.formatMessage(
        botReply.message,
      );
      finalHtml = this.responseMapper.cleanSystemTags(finalHtml);
      finalHtml = caretOff(finalHtml).trim();
      botReply.html = finalHtml;

      if (botReply.isImageLoading) {
        botReply.isImageLoading = false;
        botReply.imageLoadError =
          !botReply.images || botReply.images.length === 0;
      }

      if (botReply.isDocumentLoading) {
        botReply.isDocumentLoading = false;
        botReply.documentLoadError =
          !botReply.documents || botReply.documents.length === 0;
      }

      ensurePushed();
      updateStateCallback(targetConv);

      await completeMessage();
    };

    const completeMessage = async () => {
      if (botReply.images && botReply.images.length > 0) {
        botReply.type = 'image';
        botReply.imageUrl = botReply.images[0].url;
      }
      if (botReply.documents && botReply.documents.length > 0) {
        botReply.type = 'document';
      }

      botReply.status = 'completed';
      botReply.isPlaceholder = false;

      const lastUserMsg = targetConv.messages
        .filter((m) => m.sender === 'user')
        .slice(-1)[0];
      if (lastUserMsg) lastUserMsg.botResponseComplete = true;

      const finalKey = targetConv.conversationID || currentKey;
      conversationStore.set(finalKey, targetConv);

      updateStateCallback(targetConv);
      await onCompleteCallback(targetConv);

      // Clear generating states AFTER onCompleteCallback (which awaits endChat)
      clearAllGeneratingStates();
    };

    const tick = async () => {
      if (!typingLoopActive) return;

      // Check if request is still active/current
      if (
        activeRequestIds[currentKey] !== requestId &&
        activeRequestIds[convId] !== requestId
      ) {
        typingLoopActive = false;
        return;
      }

      // If generation is no longer active (e.g. cancelled)
      const isGenerating = !!(
        this.chatFacade.history.generatingStates()[currentKey] ||
        this.chatFacade.history.generatingStates()[convId]
      );
      if (!isGenerating && !isStreamComplete) {
        typingLoopActive = false;
        return;
      }

      if (isRendering) {
        requestAnimationFrame(tick);
        return;
      }

      const totalLen = targetText.length;
      const curLen = displayedText.length;

      if (curLen < totalLen) {
        const remaining = totalLen - curLen;
        const now = performance.now();
        const elapsed = now - lastTypedAt;

        // Calculate ms per character based on backlog
        let msPerChar = 30; // base speed: ~33 chars/sec

        if (isStreamComplete) {
          // Speed up to empty the remaining backlog when the stream is done
          if (remaining > 100) {
            msPerChar = 4;   // 250 chars/sec
          } else if (remaining > 30) {
            msPerChar = 8;   // 125 chars/sec
          } else if (remaining > 10) {
            msPerChar = 15;  // 66 chars/sec
          } else {
            msPerChar = 25;  // 40 chars/sec
          }
        } else {
          // Steady typing while streaming
          if (remaining > 100) {
            msPerChar = 8;   // 125 chars/sec
          } else if (remaining > 50) {
            msPerChar = 12;  // 83 chars/sec
          } else if (remaining > 20) {
            msPerChar = 20;  // 50 chars/sec
          } else {
            msPerChar = 30;  // 33 chars/sec
          }
        }

        // How many characters should be typed in the elapsed time
        const charsToType = Math.floor(elapsed / msPerChar);

        if (charsToType > 0) {
          const nextSlice = targetText.slice(curLen, curLen + charsToType);
          displayedText += nextSlice;
          lastTypedAt = now - (elapsed % msPerChar);

          isRendering = true;
          try {
            ensurePushed();

            const openLang = this.getOpenFenceLang(displayedText);
            const lastNewlineIdx = displayedText.lastIndexOf('\n');
            const currentLine = displayedText.substring(lastNewlineIdx + 1);
            const isTable = !openLang && currentLine.trimStart().startsWith('|');

            let parseMsg = displayedText + (isTable ? ' █\n' : ' █');

            if (openLang !== null) {
              parseMsg += '\n```';
            }

            if (parseMsg.includes('<KUMARAN_GENERATED_IMAGE>')) {
              botReply.isImageLoading = true;
            }
            if (parseMsg.includes('<KUMARAN_GENERATED_DOCUMENT>')) {
              botReply.isDocumentLoading = true;
            }
            if (parseMsg.includes('<KUMARAN_GENERATED_IMAGE>') || 
                parseMsg.includes('<KUMARAN_GENERATED_DOCUMENT>') || 
                parseMsg.includes('<KUMARAN_CHAT_HISTORY_FAILED>')) {
              parseMsg = this.responseMapper.cleanSystemTags(parseMsg);
            }

            botReply.message = displayedText;
            let html = await this.markdownService.formatMessage(parseMsg);
            html = html.replace(/<p>\s*█\s*<\/p>/g, '█');
            botReply.html = caretOff(html).replace(' █', CARET).replace('█', CARET);

            updateStateCallback(targetConv);
          } catch (err) {
            console.error('Error typing chunk:', err);
          } finally {
            isRendering = false;
          }
        }
      } else {
        // Keep lastTypedAt fresh when waiting for more chunks
        lastTypedAt = performance.now();
      }

      if (displayedText.length < targetText.length || !isStreamComplete) {
        requestAnimationFrame(tick);
      } else {
        typingLoopActive = false;
        await finalizeResponse();
      }
    };

    // Start typing rendering loop
    requestAnimationFrame(tick);

    let streamLineChunkBuffer = '';

    const stream$ = this.chatApi.sendMessageStream(payload);

    const sub = stream$.subscribe({
      next: (chunk: string) => {
        if (
          activeRequestIds[currentKey] !== requestId &&
          activeRequestIds[convId] !== requestId
        ) {
          sub.unsubscribe();
          return;
        }

        streamLineChunkBuffer += chunk || '';
        const lines = streamLineChunkBuffer.split('\n');
        streamLineChunkBuffer = lines.pop() || '';

        for (const line of lines) {
          const json = parseStreamLine(line);
          if (!json) continue;

          if (json.type === 'error') {
            const errText = json.message || 'An error occurred during streaming';
            const errorMsg = this.messageFactory.createErrorMessage(errText);
            botReply.message = errorMsg.message;
            botReply.html = errorMsg.html;
            botReply.status = 'failed';
            botReply.isPlaceholder = false;

            ensurePushed();
            clearAllGeneratingStates();

            updateStateCallback(targetConv);
            sub.unsubscribe();
            return;
          }

          if (
            json.responseType &&
            this.responseMapper.isMappedResponseType(json.responseType)
          ) {
            const finalText = this.responseMapper.getMappedResponseText(
              json.responseType,
            );
            botReply.message = finalText;
            botReply.html = finalText;
            botReply.content = finalText;
            botReply.responseType = json.responseType;
            botReply.status = 'completed';
            botReply.isPlaceholder = false;
            isMappedResponseHandled = true;

            const cid = json.conversationID || json?.augContent?.conversationID;
            if (cid) {
              const oldTempId = targetConv.tempId;
              targetConv.conversationID = cid;
              if (oldTempId) {
                this.chatFacade.attachment?.migrateUploadedDocsCache?.(oldTempId, cid);
              }
              if (isActiveCallback(targetConv)) {
                this.chatFacade.history.activeConversationID.set(cid);
                this.storageService.setConversationId(cid);
                this.storageService.setLastActiveConversationId(cid);
              }
              // Register locked model for this conversation so switching back restores it
              if (streamModel) {
                this.chatModelService.setModelForConversation(cid, streamModel);
              }
            }

            clearAllGeneratingStates();

            ensurePushed();
            updateStateCallback(targetConv);
            return;
          }

          const delta =
            json.content ?? json?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            targetText += delta;
          }
          if (json.response) {
            targetText = json.response;
          }

          const images = this.responseMapper.extractImages(json);
          if (images.length > 0) {
            ensurePushed();
            if (!botReply.images) botReply.images = [];
            botReply.type = 'image';
            images.forEach((img) => {
              if (
                !botReply.images!.some((existing) => existing.url === img.url)
              ) {
                botReply.images!.push(img);
              }
            });
            if (!botReply.imageUrl && images.length > 0) {
              botReply.imageUrl = images[0].url;
            }
          }

          const documents = this.responseMapper.extractDocuments(json);
          if (documents.length > 0) {
            ensurePushed();
            if (!botReply.documents) botReply.documents = [];
            botReply.type = 'document';
            documents.forEach((doc) => {
              if (
                !botReply.documents!.some(
                  (existing) => existing.url === doc.url,
                )
              ) {
                botReply.documents!.push(doc);
              }
            });
          }

          if (json.conversationID && !targetConv.conversationID) {
            const cid = json.conversationID;
            const oldTempId = targetConv.tempId;
            conversationStore.delete(convId);
            targetConv.conversationID = cid;
            if (oldTempId) {
              this.chatFacade.attachment?.migrateUploadedDocsCache?.(oldTempId, cid);
            }
            conversationStore.set(cid, targetConv);

            this.chatFacade.history.generatingStates()[cid] =
              this.chatFacade.history.generatingStates()[convId] ?? true;
            this.chatFacade.history.generatingStates()[convId] = true;
            if (targetConv.tempId) {
              this.chatFacade.history.generatingStates()[targetConv.tempId] = true;
            }
            if (targetConv.id) {
              this.chatFacade.history.generatingStates()[targetConv.id.toString()] = true;
            }

            activeRequestIds[cid] = activeRequestIds[convId];
            delete activeRequestIds[convId];

            if (currentRequestSubs[convId]) {
              currentRequestSubs[cid] = currentRequestSubs[convId];
              delete currentRequestSubs[convId];
            }

            currentKey = cid;

            if (isActiveCallback(targetConv)) {
              this.chatFacade.history.activeConversationID.set(cid);
              this.storageService.setConversationId(cid);
              this.storageService.setLastActiveConversationId(cid);
            }

            // Register locked model for this conversation so switching back restores it
            if (streamModel) {
              this.chatModelService.setModelForConversation(cid, streamModel);
            }

            updateStateCallback(targetConv);
          }

          if (json.finish_reason === 'stop' || json.type === 'final' || json.response) {
            if (json?.responseType) botReply.responseType = json?.responseType;
            const cid =
              json?.conversationID || json?.augContent?.conversationID;
            if (cid) {
              const oldTempId = targetConv.tempId;
              targetConv.conversationID = cid;
              if (oldTempId) {
                this.chatFacade.attachment?.migrateUploadedDocsCache?.(oldTempId, cid);
              }
              if (isActiveCallback(targetConv)) {
                this.chatFacade.history.activeConversationID.set(cid);
                this.storageService.setConversationId(cid);
              }
            }
            if (Array.isArray(json?.augSrc) && json.augSrc.length) {
              botReply.augSrc = json.augSrc;
              targetConv.augSrc = json.augSrc;
            }
            if (Array.isArray(json?.generated_document_ids)) {
              botReply.generated_document_ids = json.generated_document_ids;
            }
          }
        }
      },
      error: (err) => {
        console.error('Stream error:', err);
        clearAllGeneratingStates();

        const chatState = this.injector.get(ChatStateService);
        if (err.status === 419 || err.status === 519) {
          if (hasPushedReply) {
            const idx = targetConv.messages.indexOf(botReply);
            if (idx > -1) {
              targetConv.messages.splice(idx, 1);
              updateStateCallback(targetConv);
            }
          }
          if (err.status === 419) {
            chatState.showSessionExpiredPopup.set(true);
          } else {
            chatState.showLimitPopup.set(true);
          }
          return;
        }

        let errText: string | undefined;
        if (err.status === 413) {
          errText =
            err?.error?.error ||
            'Query Exceeds input limit for the current model';
        }

        const errorMsg = this.messageFactory.createErrorMessage(errText);
        botReply.message = errorMsg.message;
        botReply.html = errorMsg.html;
        botReply.status = 'failed';
        botReply.isPlaceholder = false;
        ensurePushed();
        updateStateCallback(targetConv);
      },
      complete: async () => {
        ensurePushed();
        if (streamLineChunkBuffer.trim()) {
          const json = parseStreamLine(streamLineChunkBuffer);
          if (json) {
            if (json.type === 'error') {
              const errText = json.message || 'An error occurred during streaming';
              const errorMsg = this.messageFactory.createErrorMessage(errText);
              botReply.message = errorMsg.message;
              botReply.html = errorMsg.html;
              botReply.status = 'failed';
              botReply.isPlaceholder = false;
              clearAllGeneratingStates();
              updateStateCallback(targetConv);
              return;
            }
            
            if (json.finish_reason === 'stop' || json.type === 'final' || json.response) {
              if (json?.responseType) botReply.responseType = json.responseType;
              const cid =
                json?.conversationID || json?.augContent?.conversationID;
              if (cid) {
                const oldTempId = targetConv.tempId;
                targetConv.conversationID = cid;
                if (oldTempId) {
                  this.chatFacade.attachment?.migrateUploadedDocsCache?.(oldTempId, cid);
                }
                if (isActiveCallback(targetConv)) {
                  this.chatFacade.history.activeConversationID.set(cid);
                  this.storageService.setConversationId(cid);
                }
                // Register locked model for this conversation so switching back restores it
                if (streamModel) {
                  this.chatModelService.setModelForConversation(cid, streamModel);
                }
              }
              if (Array.isArray(json?.augSrc) && json.augSrc.length) {
                botReply.augSrc = json.augSrc;
                targetConv.augSrc = json.augSrc;
              }
              if (Array.isArray(json?.generated_document_ids)) {
                botReply.generated_document_ids = json.generated_document_ids;
              }
              const images = this.responseMapper.extractImages(json);
              if (images.length > 0) {
                if (!botReply.images) botReply.images = [];
                botReply.type = 'image';
                images.forEach((img) => {
                  if (
                    !botReply.images!.some((existing) => existing.url === img.url)
                  ) {
                    botReply.images!.push(img);
                  }
                });
                if (!botReply.imageUrl && images.length > 0) {
                  botReply.imageUrl = images[0].url;
                }
              }
              const documents = this.responseMapper.extractDocuments(json);
              if (documents.length > 0) {
                if (!botReply.documents) botReply.documents = [];
                botReply.type = 'document';
                documents.forEach((doc) => {
                  if (
                    !botReply.documents!.some(
                      (existing) => existing.url === doc.url,
                    )
                  ) {
                    botReply.documents!.push(doc);
                  }
                });
              }
            }
            const delta = json.content ?? json?.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              targetText += delta;
            }
            if (json.response) {
              targetText = json.response;
            }
          }
        }

        isStreamComplete = true;
        if (!typingLoopActive || displayedText.length < targetText.length) {
          typingLoopActive = false;
          await finalizeResponse();
        }
      },
    });
    currentRequestSubs[convId] = sub;
  }
}
