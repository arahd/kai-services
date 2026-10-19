import { Injectable, inject } from '@angular/core';
import { VoiceRecognitionService } from '@features/chatbot/services/voice-recognition.service';
import { AttachmentService } from '@features/chatbot/services/attachment.service';
import { ChatHistoryStateService } from '@features/chatbot/services/chat-history-state.service';
import { ClipboardShareService } from '@features/chatbot/services/clipboard-share.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { TokenService } from '@core/services/token.service';

@Injectable({
  providedIn: 'root',
})
export class ChatFacadeService {
  public readonly voice = inject(VoiceRecognitionService);
  public readonly attachment = inject(AttachmentService);
  public readonly history = inject(ChatHistoryStateService);
  public readonly clipboard = inject(ClipboardShareService);
  public readonly azureAd = inject(AzureAdService);
  public readonly token = inject(TokenService);

  // Voice methods
  startVoice(onError: (err: any) => void) {
    this.voice.startVoice(onError);
  }

  stopVoice() {
    this.voice.stopVoice();
  }

  cancelVoiceMode() {
    this.voice.cancelVoiceMode();
  }

  confirmVoiceInput(): string {
    return this.voice.confirmVoiceInput();
  }

  // Attachment methods
  addFiles(files: FileList | File[], conversationId: string) {
    this.attachment.addFiles(files, conversationId);
  }

  removeFile(index: number) {
    this.attachment.removeFile(index);
  }

  retryUpload(fp: any, conversationId: string) {
    this.attachment.retryUpload(fp, conversationId);
  }

  removeImageFiles(): number {
    return this.attachment.removeImageFiles();
  }
}
