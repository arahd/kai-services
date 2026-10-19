import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { AgentChatMessage, AgentItem, GetAgentsResponse } from '../models/agent.model';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private tokenService = inject(TokenService);
  private storageService = inject(SessionStorageService);

  readonly agentsResponse = signal<GetAgentsResponse | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly isLoaded = signal<boolean>(false);
  readonly selectedAgent = signal<AgentItem | null>(null);

  // Computed collections
  readonly totalCount = computed(() => this.agentsResponse()?.count?.total || 0);
  readonly privateAgents = computed(() => this.agentsResponse()?.private || []);
  readonly groupAgents = computed(() => this.agentsResponse()?.group || []);
  readonly publicAgents = computed(() => this.agentsResponse()?.public || []);
  readonly allAgents = computed<AgentItem[]>(() => {
    const res = this.agentsResponse();
    if (!res) return [];
    return [...(res.private || []), ...(res.group || []), ...(res.public || [])];
  });

  private getAuthHeaders(): HttpHeaders {
    const token = this.tokenService.getToken() || this.storageService.getJwtToken() || '';
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private getBaseUrl(): string {
    const url = this.configService.getKPlatformUrl() || 'https://kplatform-dev.kumaran.ai';
    return url.replace(/\/login\/?$/, '').replace(/\/$/, '');
  }

  private inFlightRequest$: Observable<GetAgentsResponse | null> | null = null;

  /**
   * Loads the complete list of created agents
   */
  getAgents(forceRefresh = false): Observable<GetAgentsResponse | null> {
    if (this.isLoaded() && !forceRefresh && this.agentsResponse()) {
      return of(this.agentsResponse());
    }

    if (this.inFlightRequest$ && !forceRefresh) {
      return this.inFlightRequest$;
    }

    this.isLoading.set(true);
    const url = `${this.getBaseUrl()}/agent-config/api/v2/agent/get_agents?usage=my_agents`;

    this.inFlightRequest$ = this.http.get<GetAgentsResponse>(url, { headers: this.getAuthHeaders() }).pipe(
      tap((res) => {
        this.agentsResponse.set(res);
        this.isLoaded.set(true);
        this.isLoading.set(false);
        this.inFlightRequest$ = null;
      }),
      catchError((err) => {
        console.error('[AgentService] Error loading agents:', err);
        this.isLoading.set(false);
        this.inFlightRequest$ = null;
        return of(null);
      }),
      shareReplay(1)
    );

    return this.inFlightRequest$;
  }

  /**
   * Find an agent by ID
   */
  getAgentById(id: string): AgentItem | undefined {
    return this.allAgents().find((a) => a.id === id);
  }

  /**
   * Universal Agent Chat Dispatcher:
   * Normalizes SIMPLE, PIPELINE, and PEV chat payloads & responses.
   */
  sendAgentPrompt(
    agent: AgentItem,
    prompt: string,
    chatId?: string
  ): Observable<{ message: string; chatId?: string; raw?: any }> {
    const targetUrl = agent.agent_url || `${this.getBaseUrl()}/${agent.agent_type.toLowerCase()}/chat`;
    const payload: any = {
      agent_id: agent.id,
      user_prompt: prompt,
    };
    if (chatId) {
      payload.chat_id = chatId;
    }

    return this.http.post<any>(targetUrl, payload, { headers: this.getAuthHeaders() }).pipe(
      map((res) => {
        let extractedMessage = '';
        let newChatId: string | undefined = chatId;

        if (agent.agent_type === 'SIMPLE') {
          extractedMessage = res?.model_response?.message || 'No response received from agent.';
        } else if (agent.agent_type === 'PIPELINE') {
          extractedMessage = res?.message || 'No response received from agent.';
        } else if (agent.agent_type === 'PEV') {
          extractedMessage =
            res?.model_response?.response?.message ||
            res?.message ||
            'No response received from agent.';
          newChatId = res?.model_response?.response?.chat_id || chatId;
        } else {
          extractedMessage = res?.message || res?.model_response?.message || JSON.stringify(res);
        }

        return {
          message: extractedMessage,
          chatId: newChatId,
          raw: res,
        };
      })
    );
  }
}
