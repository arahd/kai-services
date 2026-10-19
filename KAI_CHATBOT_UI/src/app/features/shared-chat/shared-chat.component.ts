import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ResponseMapperService } from '@features/chatbot/services/response-mapper.service';
import { MarkdownService } from '@shared/services/markdown.service';
import { TooltipDirective } from '@shared/directives/tooltip.directive';
import { UserMessageComponent } from '@features/chatbot/components/user-message/user-message.component';
import { BotMessageComponent } from '@features/chatbot/components/bot-message/bot-message.component';

interface NormalizedMessage {
  sender: 'user' | 'bot';
  message: string;
  html?: string;
  images?: { url: string; name: string }[];
  generated_image_ids?: string[];
  isImageLoading?: boolean;
  imageLoadError?: boolean;
  timestamp: Date;
  responseType: 'text' | 'image';
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-shared-chat',
  standalone: true,
  imports: [CommonModule, TooltipDirective, UserMessageComponent, BotMessageComponent],
  templateUrl: './shared-chat.component.html',
  styleUrls: ['./shared-chat.component.scss'],
})
export class SharedChatComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chatService = inject(ChatService);
  private responseMapper = inject(ResponseMapperService);
  private markdownService = inject(MarkdownService);
  private cdr = inject(ChangeDetectorRef);

  token: string = '';
  loading = true;
  error = false;
  errorMessage = '';
  
  conversationTitle = 'Shared Conversation';
  messages: NormalizedMessage[] = [];
  copied: { [key: number]: boolean } = {};
  private conversationID = '';
  
  private routeSub?: Subscription;

  ngOnInit() {
    this.routeSub = this.route.params.subscribe((params) => {
      this.token = params['token'] || '';
      if (this.token) {
        this.loadSharedChat();
      } else {
        this.error = true;
        this.errorMessage = 'Invalid share link.';
        this.loading = false;
      }
    });
  }

  ngOnDestroy() {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  loadSharedChat() {
    this.loading = true;
    this.error = false;
    this.errorMessage = '';

    this.chatService.getSharedChat(this.token).subscribe({
      next: async (res: any) => {
        if (!res) {
          this.error = true;
          this.errorMessage = 'No data found for this shared conversation.';
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }

        // Handle title / greetings
        this.conversationTitle = 
          res.conversationName || 
          res.greetings || 
          res.title || 
          (res.conversation && res.conversation[0]?.question) ||
          'Shared Conversation';

        // Store conversationID for image fetching
        this.conversationID = res.conversationID || '';

        // Extract and normalize messages
        const rawMsgs = this.normalizeMessages(res);
        
        // Parse markdown for all bot messages
        this.messages = [];
        for (const msg of rawMsgs) {
          if (msg.sender === 'bot') {
            const html = await this.formatMarkdown(msg.message);
            this.messages.push({
              ...msg,
              html,
            });
          } else {
            this.messages.push(msg);
          }
        }

        this.loading = false;
        this.cdr.detectChanges();

        // Fetch generated images (without JWT) for messages that have generated_image_ids
        this.fetchGeneratedImages();
      },
      error: (err) => {
        console.error('Failed to load shared chat:', err);
        this.error = true;
        this.errorMessage = 'Failed to load shared conversation. It may have expired or been deleted.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  normalizeMessages(data: any): NormalizedMessage[] {
    if (!data) {
      return [];
    }
    if (Array.isArray(data)) {
      return data.map(m => this.mapSingleMessage(m));
    }
    if (data.messages && Array.isArray(data.messages)) {
      return data.messages.map((m: any) => this.mapSingleMessage(m));
    }
    if (data.conversation && Array.isArray(data.conversation)) {
      const msgs: NormalizedMessage[] = [];
      data.conversation.forEach((pair: any) => {
        if (pair.question) {
          msgs.push({
            sender: 'user',
            message: pair.question,
            timestamp: pair.timestamp ? new Date(pair.timestamp) : new Date(),
            responseType: 'text'
          });
        }
        if (pair.response || pair.answer) {
          const hasGeneratedImages =
            Array.isArray(pair.generated_image_ids) &&
            pair.generated_image_ids.length > 0;
          const hasCachedImages =
            Array.isArray(pair.cached_images) && pair.cached_images.length > 0;

          msgs.push({
            sender: 'bot',
            message: pair.response || pair.answer,
            images: hasCachedImages ? pair.cached_images : [],
            generated_image_ids: hasGeneratedImages ? pair.generated_image_ids : undefined,
            isImageLoading: hasGeneratedImages && !hasCachedImages,
            imageLoadError: false,
            timestamp: pair.timestamp ? new Date(pair.timestamp) : new Date(),
            responseType: hasGeneratedImages ? 'image' : 'text'
          });
        }
      });
      return msgs;
    }
    return [];
  }

  private mapSingleMessage(m: any): NormalizedMessage {
    const sender = m.sender || m.role || 'bot';
    const senderNormalized = (sender === 'user' || sender === 'human') ? 'user' : 'bot';
    return {
      sender: senderNormalized,
      message: m.message || m.content || '',
      images: m.images || [],
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      responseType: 'text'
    };
  }

  /** Fetch generated images without JWT for shared-chat messages. */
  private fetchGeneratedImages(): void {
    if (!this.conversationID) return;

    this.messages.forEach((msg, msgIndex) => {
      if (
        msg.sender !== 'bot' ||
        !msg.generated_image_ids ||
        msg.generated_image_ids.length === 0 ||
        (msg.images && msg.images.length > 0)
      ) {
        return;
      }

      msg.generated_image_ids.forEach((imageId) => {
        const payload = {
          conversation_id: this.conversationID,
          image_id: imageId,
        };

        this.chatService.getGeneratedImagePublic(payload).subscribe({
          next: (res: any) => {
            const currentMsg = this.messages[msgIndex];
            const images = this.responseMapper.extractImages(res);
            const updatedImages = [...(currentMsg.images || []), ...images];
            this.messages[msgIndex] = {
              ...currentMsg,
              images: updatedImages,
              isImageLoading: false,
              imageLoadError: updatedImages.length === 0,
            };
            this.messages = [...this.messages];
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error(`Failed to fetch shared image ${imageId}:`, err);
            const currentMsg = this.messages[msgIndex];
            this.messages[msgIndex] = {
              ...currentMsg,
              isImageLoading: false,
              imageLoadError: true,
            };
            this.messages = [...this.messages];
            this.cdr.detectChanges();
          },
        });
      });
    });
  }

  private async formatMarkdown(message: string): Promise<string> {
    const renderer = new marked.Renderer();

    renderer.link = ({
      href,
      title,
      text,
    }: {
      href: string;
      title?: string | null;
      text: string;
    }) => {
      const safeHref = href || '#';
      const titleAttr = title ? ` title="${title}"` : '';

      return `
      <a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>
        ${text}
      </a>
    `;
    };

    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(text, { language }).value;
      const displayLang = lang || language;

      return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-label">&lt;/&gt; ${displayLang}</span>
          <span class="code-header-copy-placeholder" data-copy="true"></span>
        </div>
        <pre class="code-block"><code class="hljs ${language}">${highlighted}</code></pre>
      </div>
    `;
    };

    return await marked.parse(message, { renderer });
    return await this.markdownService.formatMessage(message);
  }

  copyResponse(text: string, index: number): void {
    navigator.clipboard.writeText(text).then(
      () => {
        this.copied[index] = true;
        this.cdr.detectChanges();
        setTimeout(() => {
          this.copied[index] = false;
          this.cdr.detectChanges();
        }, 2000);
      },
      (err) => {
        console.error('Failed to copy text:', err);
      }
    );
  }

  navigateToApp() {
    this.router.navigate(['/login']);
  }
}
