import { Injectable } from '@angular/core';
import { ChatMessage, FilePreview, MessageSender } from '@shared/models';

@Injectable({ providedIn: 'root' })
export class MessageFactoryService {

  createUserMessage(text: string, attachments: FilePreview[] = []): ChatMessage {
    return {
      sender: 'user',
      message: text,
      timestamp: new Date(),
      botResponseComplete: false,
      responseType: '',
      attachments: [...attachments],
      canCollapse: text.length > 300,
      collapsed: text.length > 300,
      status: 'completed',
    };
  }

  createBotPlaceholder(): ChatMessage {
    return {
      sender: 'bot',
      role: 'assistant',
      type: 'text',
      content: '',
      message: '',
      html: '',
      timestamp: new Date(),
      responseType: '',
      status: 'pending',
      isPlaceholder: true,
    };
  }

  createErrorMessage(customMessage?: string): ChatMessage {
    const errorMsg = customMessage || '⚠️ We’re unable to generate a response right now. Please try again.';
    return {
      sender: 'bot',
      role: 'assistant',
      type: 'text',
      content: errorMsg,
      message: errorMsg,
      html: `<p>${errorMsg}</p>`,
      timestamp: new Date(),
      responseType: '',
      status: 'failed',
      isPlaceholder: false,
    };
  }

  createCancelledMessage(): ChatMessage {
    return {
      sender: 'bot',
      role: 'assistant',
      message: 'Response generation canceled.',
      timestamp: new Date(),
      responseType: '',
      status: 'failed',
      isPlaceholder: false,
    };
  }
}
