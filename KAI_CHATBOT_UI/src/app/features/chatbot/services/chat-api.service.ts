import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ConfigService } from '@core/services/config.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { BaseApiService } from '@core/services/base-api.service';
import {
  SendMessagePayload,
  EndChatPayload,
  SuggestionsPayload,
  SuggestionsResponse,
  ConversationHistoryPayload,
  ChatHistoryListPayload,
  ChatHistoryConversationPayload,
  ChatHistoryConversationResponse,
  ProjectConversationsParams,
  ProjectConversationsResponse,
  ProjectConversationParams,
  DeleteChatPayload,
  PinChatPayload,
  RenameChatPayload,
  ShareChatPayload,
} from '@shared/models';

@Injectable({ providedIn: 'root' })
export class ChatApiService extends BaseApiService {
  protected readonly http = inject(HttpClient);
  protected readonly configService = inject(ConfigService);
  protected readonly azureAdService = inject(AzureAdService);

  protected getBaseUrl(): string {
    // Note: Some endpoints go to chatbotUrl, some to azureUrl.
    // The base methods point to Azure by default, so we override when calling Chatbot.
    return this.configService.getAzureUrl();
  }

  // --- Standard Chat Messaging APIs (Python backend) ---

  sendMessage(payload: SendMessagePayload): Observable<any> {
    return from(this.configService.loadConfig()).pipe(
      switchMap(() => {
        const url = `${this.configService.getChatbotUrl()}/chatservice`;
        return new Observable<any>((observer) => {
          const controller = new AbortController();
          
          this['postWithAuth']<any>(url, payload, controller.signal)
            .then((res) => {
              observer.next(res);
              observer.complete();
            })
            .catch((err) => {
              if (err.name === 'AbortError') {
                return;
              }
              observer.error(err);
            });

          return () => {
            controller.abort();
          };
        });
      })
    );
  }

  // The streaming fetch logic is complex with text decoders and we leave it specialized.
  sendMessageStream(payload: SendMessagePayload): Observable<string> {
    return from(this.configService.loadConfig()).pipe(
      switchMap(() => {
        const url = `${this.configService.getChatbotUrl()}/chatservice`;

        const makeFetch = (token: string): Observable<string> => {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          };

          return new Observable<string>((observer) => {
            const controller = new AbortController();
            const signal = controller.signal;

            fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal })
              .then(async (response) => {
                if (response.status === 401) {
                  await this.refreshTokenAndRetry(async (newToken) => {
                    makeFetch(newToken).subscribe(observer);
 // perf-ignore
                    return null as any;
                  });
                  return;
                }

                if (!response.ok || !response.body) {
                  const error: any = new Error('Streaming request failed');
                  error.status = response.status;
                  throw error;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                const read = () => {
                  reader.read().then(({ done, value }) => {
                    if (done) {
                      observer.complete();
                      return;
                    }
                    const chunk = decoder.decode(value, { stream: true });
                    observer.next(chunk);
                    read();
                  }).catch((err) => {
                    if (err.name === 'AbortError') {
                      return;
                    }
                    observer.error(err);
                  });
                };
                read();
              })
              .catch((err) => {
                if (err.name === 'AbortError') {
                  return;
                }
                observer.error(err);
              });

            return () => {
              controller.abort();
            };
          });
        };

        const existingToken = this.storageService.getJwtToken() || '';
        return makeFetch(existingToken);
      })
    );
  }

  // --- Conversation Management APIs (Azure backend) ---

  getConversationHistory(payload: ConversationHistoryPayload, page: number = 1, limit: number = 20): Observable<any> {
    return this.post<any>(`/transcript/chat/history?page_number=${page}&page_size=${limit}`, payload);
  }

  getGeneratedImage(payload: { conversation_id: string; image_id: string }): Observable<any> {
    return this.post<any>('/transcript/chat/get_image', payload);
  }

  /** Public (no-auth) version of getGeneratedImage for shared-chat pages. */
  getGeneratedImagePublic(payload: { conversation_id: string; image_id: string }): Observable<any> {
    return this.postPublic<any>('/transcript/chat/get_image', payload);
  }

  getGeneratedDocument(payload: {
    conversation_id: string;
    generated_document_id: string;
  }): Observable<any> {
    return this.post<any>('/transcript/chat/get_generated_document', payload);
  }

  /** Fetch uploaded documents/files for a given conversation_id */
  getUploadedDocument(payload: { conversation_id: string }): Observable<any> {
    return this.post<any>('/transcript/chat/get_uploaded_document', payload);
  }

  endChat(payload: EndChatPayload): Observable<any> {
    return this.post<any>('/conversation/endchat', payload);
  }

  deleteChat(payload: DeleteChatPayload | { conversationID: string; project_id?: string | number }): Observable<any> {
    const body: any = { conversationID: payload.conversationID };
    if ((payload as any).project_id != null) {
      body.project_id = String((payload as any).project_id);
    }
    return this.delete<any>('/transcript/chat/delete', body);
  }

  pinChat(conversationIDOrPayload: string | PinChatPayload, projectId?: string | number): Observable<any> {
    let body: any;
    if (typeof conversationIDOrPayload === 'string') {
      body = { conversationID: conversationIDOrPayload };
      if (projectId != null) {
        body.project_id = String(projectId);
      }
    } else {
      body = { ...conversationIDOrPayload };
      if (body.project_id != null) {
        body.project_id = String(body.project_id);
      }
    }
    return this.http.patch(`${this.getBaseUrl()}/transcript/chat/pinned`, body);
  }

  renameChat(payload: RenameChatPayload | { conversationID: string; conversationName: string; project_id?: string | number }): Observable<any> {
    const body: any = {
      conversationID: payload.conversationID,
      conversationName: payload.conversationName,
    };
    if ((payload as any).project_id != null) {
      body.project_id = String((payload as any).project_id);
    }
    return this.put<any>('/transcript/chat/rename', body);
  }

  shareChat(payload: ShareChatPayload | { conversationID: string; date_info: string; user_string: string; bot_type: string; project_id?: string | number }): Observable<any> {
    const body: any = {
      conversationID: payload.conversationID,
      date_info: payload.date_info,
      user_string: payload.user_string,
      bot_type: payload.bot_type,
    };
    if ((payload as any).project_id != null) {
      body.project_id = String((payload as any).project_id);
    }
    return this.post<any>('/transcript/chat/share', body);
  }

  getSharedChat(token: string): Observable<any> {
    return this.get<any>(`/transcript/s/${token}`);
  }

  searchChat(payload: any): Observable<any> {
    return this.post<any>('/transcript/chat/search', payload);
  }

  getChatInformation(payload: any): Observable<any> {
    return this.post<any>('/transcript/chat/search/result', payload);
  }

  getSuggestions(payload: SuggestionsPayload): Observable<SuggestionsResponse> {
    return this.post<SuggestionsResponse>('/conversation/suggested-follow-ups', payload);
  }

  chatSummarization(payload: { conversationID: string }): Observable<any> {
    return this.post<any>('/conversation/summarization', payload);
  }

  // --- New Chat History APIs ---

  /** POST /transcript/chat/history/list — General chat history list */
  getNewChatHistoryList(
    payload: ChatHistoryListPayload,
    page: number = 1,
    limit: number = 20
  ): Observable<any> {
    const qs = new URLSearchParams({
      page_number: String(page),
      page_size: String(limit),
    }).toString();
    return this.post<any>(`/transcript/chat/history/list?${qs}`, payload);
  }

  /** POST /transcript/chat/history/conversation — Full conversation by ID */
  getNewChatHistoryConversation(payload: ChatHistoryConversationPayload): Observable<ChatHistoryConversationResponse> {
    return this.post<ChatHistoryConversationResponse>('/transcript/chat/history/conversation', payload);
  }

  /** POST /transcript/chat/history/project/conversations — Project-scoped conversation list */
  getProjectChatHistoryList(params: ProjectConversationsParams): Observable<ProjectConversationsResponse> {
    const qs = new URLSearchParams({
      page_number: String(params.page_number ?? 1),
      page_size: String(params.page_size ?? 20),
    }).toString();
    const payload = {
      user_string: params.user_string,
      bot_type: params.bot_type,
      project_id: String(params.project_id),
    };
    return this.post<ProjectConversationsResponse>(`/transcript/chat/history/project/conversations?${qs}`, payload);
  }

  /** POST /transcript/chat/history/project/conversation — Single conversation in a project */
  getProjectChatHistoryConversation(params: ProjectConversationParams): Observable<ChatHistoryConversationResponse> {
    const payload = {
      user_string: params.user_string,
      bot_type: params.bot_type,
      project_id: String(params.project_id),
      conversation_id: params.conversation_id,
    };
    return this.post<ChatHistoryConversationResponse>('/transcript/chat/history/project/conversation', payload);
  }

  /** POST /conversation/project/rename — Rename project */
  renameProject(payload: { project_id: number; project_name: string }): Observable<any> {
    return this.post<any>('/conversation/project/rename', payload);
  }
}
