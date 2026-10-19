import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from '@core/services/config.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { BaseApiService } from '@core/services/base-api.service';
import {
  FetchPromptPayload,
  FetchPromptResponse,
  UpdatePromptPayload,
  UpdatePromptResponse
} from '@shared/models';

@Injectable({ providedIn: 'root' })
export class PromptApiService extends BaseApiService {
  protected readonly http = inject(HttpClient);
  protected readonly configService = inject(ConfigService);
  protected readonly azureAdService = inject(AzureAdService);

  protected getBaseUrl(): string {
    return this.configService.getChatbotUrl();
  }

  private mapFileNameToPromptName(name: string): string {
    const trimmed = String(name ?? '').trim();
    if (trimmed === 'general_chat') return 'GENERAL_CHAT_PROMPT';
    if (trimmed === 'suggested_follow_ups' || trimmed === 'followup_questions') return 'SUGGESTED_FOLLOW_UP_QUESTIONS_PROMPT';
    return trimmed;
  }

  fetchPrompt(payload: FetchPromptPayload): Observable<FetchPromptResponse> {
    const promptName = this.mapFileNameToPromptName(payload?.prompt_name ?? '');
    return this.post<FetchPromptResponse>('/fetch-prompt', { prompt_name: promptName });
  }

  updatePrompt(payload: UpdatePromptPayload): Observable<UpdatePromptResponse> {
    const promptName = this.mapFileNameToPromptName(payload?.prompt_name ?? '');
    return this.put<UpdatePromptResponse>('/update-prompt', {
      prompt_name: promptName,
      content: payload?.content ?? '',
    });
  }
}
