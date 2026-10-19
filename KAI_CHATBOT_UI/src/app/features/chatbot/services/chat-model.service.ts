import { Injectable, inject, signal, computed } from '@angular/core';
import { ChatService } from '@features/chatbot/services/chat.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';

export const IMAGE_RESTRICTED_MODELS = ['FW-Kimi-K3', 'Kimi-K2.6'] as const;

export function isImageRestrictedModel(modelName?: string | null): boolean {
  if (!modelName) return false;
  return modelName.toLowerCase().includes('kimi');
}

export interface ModelOption {
  value: string;
  label: string;
  description?: string;
  isDefault?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ChatModelService {
  private readonly chatService = inject(ChatService);
  private readonly layoutBridge = inject(SidenavLayoutBridgeService);

  readonly models = signal<ModelOption[]>([]);
  readonly selectedModel = signal<string>('');
  readonly persistedLatestModel = signal<string | null>(null);

  /** Whether image uploads are restricted for the currently selected model */
  readonly isImageUploadRestricted = computed(() =>
    isImageRestrictedModel(this.selectedModel())
  );

  /** Whether the current conversation has a locked model */
  readonly modelLocked = signal<boolean>(false);

  /** Map of conversationID → model_name from the backend */
  private conversationModelMap = new Map<string, string>();

  private loadedEmail: string | null = null;
  readonly isLoadingModels = signal<boolean>(false);

  loadModels(email: string | null, forceRefresh: boolean = false) {
    if (!forceRefresh) {
      if (this.models().length > 0 && (!email || this.loadedEmail === email)) {
        return;
      }
      if (this.isLoadingModels()) {
        return;
      }
    }
    this.isLoadingModels.set(true);
    this.loadedEmail = email;

    this.chatService.getReportingModels({ bot_type: 'kumaran' }).subscribe({
      // perf-ignore
      next: (res: any) => {
        this.isLoadingModels.set(false);
        const apiModels = Array.isArray(res?.report_gpt_model)
          ? res.report_gpt_model
          : Array.isArray(res)
            ? res
            : [];

        const mappedModels: ModelOption[] = apiModels
          .map((m: any) => {
            if (typeof m === 'string') {
              return { value: m, label: m };
            }
            return {
              value: m.value,
              label: m.displayName || m.value,
              description: m.description,
              isDefault: m.isDefault,
              isEnabled: m.isEnabled !== false,
            };
          })
          .filter((m: any) => m.isEnabled !== false);

        this.models.set(mappedModels);
        this.layoutBridge.setModels(mappedModels);

        if (mappedModels.length === 0) {
          this.selectedModel.set('');
          return;
        }

        const defaultModel = mappedModels.find((m) => m.isDefault);
        const selectedExists = mappedModels.some(
          (m) => m.value === this.selectedModel(),
        );

        const persisted = this.persistedLatestModel();
        if (persisted) {
          const modelExists = mappedModels.some((m) => m.value === persisted);
          if (modelExists) {
            this.selectedModel.set(persisted);
          } else if (!selectedExists) {
            this.selectedModel.set(defaultModel ? defaultModel.value : mappedModels[0].value);
          }
        } else if (!selectedExists) {
          this.selectedModel.set(defaultModel ? defaultModel.value : mappedModels[0].value);
        }

        if (email) {
          this.loadUserLatestModel(email);
        }
      },
      error: (err) => {
        this.isLoadingModels.set(false);
        console.error('Failed to load models', err);
      },
    });
  }

  loadUserLatestModel(email: string) {
    if (!email) return;

    this.chatService.fetchUserLatestModel(email).subscribe({
 // perf-ignore
      next: (res: any) => {
        if (res && res.latest_model) {
          this.persistedLatestModel.set(res.latest_model);
          const currentModels = this.models();
          if (currentModels.length > 0) {
            const modelExists = currentModels.some((m) => m.value === res.latest_model);
            if (modelExists) {
              this.selectedModel.set(res.latest_model);
            }
          }
        }

        // Build conversation → model map from backend data
        if (Array.isArray(res?.conversations)) {
          this.conversationModelMap.clear();
          for (const entry of res.conversations) {
            if (entry.conversation_id && entry.model_name) {
              this.conversationModelMap.set(entry.conversation_id, entry.model_name);
            }
          }
        }
      },
      error: (err) => {
        console.warn('User latest model not found or failed to fetch, using default.', err);
      }
    });
  }

  selectModel(modelValue: string, email: string | null): boolean {
    if (this.modelLocked()) {
      console.warn('Model is locked for this conversation. Start a new chat to switch models.');
      return false;
    }

    this.selectedModel.set(modelValue);

    if (email) {
      const defaultModel = this.models().find(m => m.isDefault)?.value || 'gpt-4o-mini';
      this.chatService.updateUserLatestModel({
        userId: email,
        default_model: defaultModel,
        latest_model: modelValue
      }).subscribe({
 // perf-ignore
        next: (res) => {
          console.log('User latest model persisted successfully:', res);
        },
        error: (err) => {
          console.error('Failed to persist user latest model:', err);
        }
      });
    }
    return true;
  }

  /** Lock the model for the current conversation */
  lockModel(modelValue: string): void {
    if (modelValue) {
      this.selectedModel.set(modelValue);
    }
    this.modelLocked.set(true);
  }

  /** Unlock model selection (called when starting a new chat) */
  unlockModel(): void {
    this.modelLocked.set(false);
    const persisted = this.persistedLatestModel();
    const currentModels = this.models();
    if (persisted && currentModels.some((m) => m.value === persisted)) {
      this.selectedModel.set(persisted);
    } else if (currentModels.length > 0) {
      const defaultModel = currentModels.find((m) => m.isDefault);
      this.selectedModel.set(defaultModel ? defaultModel.value : currentModels[0].value);
    }
  }

  /** Register a model for a conversation in the local map */
  setModelForConversation(conversationID: string, modelName: string): void {
    if (conversationID && modelName) {
      this.conversationModelMap.set(conversationID, modelName);
    } else {
      console.warn(
        'setModelForConversation: missing required parameter —',
        `conversationID="${conversationID}", modelName="${modelName}"`
      );
    }
  }

  /** Look up the model for a given conversationID from backend data */
  getModelForConversation(conversationID: string): string | null {
    return this.conversationModelMap.get(conversationID) || null;
  }

  getSelectedModelLabel(): string {
    const found = this.models().find((m) => m.value === this.selectedModel());
    return found ? found.label : '';
  }

  /** Check if a specific model or currently selected model restricts image uploads */
  isModelImageRestricted(modelName?: string | null): boolean {
    return isImageRestrictedModel(modelName ?? this.selectedModel());
  }
}
