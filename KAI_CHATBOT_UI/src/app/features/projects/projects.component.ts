import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import type { SidenavLayoutHost } from '@core/layout/sidenav-layout-host';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-projects',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="projects-container">
      <router-outlet></router-outlet>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        height: 100%;
        width: 100%;
        overflow: hidden;
      }

      .projects-container {
        width: 100%;
        height: 100%;
        flex: 1;
        min-height: 0;
        background-color: var(--px-bg, #ffffff);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
    `,
  ],
})
export class ProjectsComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly sidenavLayout = inject(SidenavLayoutBridgeService);
  private readonly storageService = inject(SessionStorageService);
  private readonly tokenService = inject(TokenService);
  private readonly chatModelService = inject(ChatModelService);

  private projectsStreaming = false;

  ngOnInit(): void {
    const email = this.tokenService.getUserInfo()?.email || '';
    this.chatModelService.loadModels(email);

    const host: SidenavLayoutHost = {
      generatingStates: {},
      getStreaming: () => this.projectsStreaming,
      handleStreamingToggle: (next) => {
        this.projectsStreaming = next;
      },
      emitActiveChatOnInit: false,
      staticMode: false,
      onNewChat: () => {
        this.storageService.removeConversationId();
        this.storageService.removeLastActiveConversationId();
        this.router.navigate(['/chatbot']);
      },
      onChatSelected: (chat: any) => {
        const cid = chat?.conversationID;
        if (cid) {
          this.storageService.setConversationId(cid);
          this.storageService.setLastActiveConversationId(cid);
          // Navigate directly to the conversation page to avoid
          // loading the welcome page and re-triggering history/list API
          this.router.navigate(['/chatbot', cid]);
        } else {
          this.router.navigate(['/chatbot']);
        }
      },
      onSearchModalToggle: (_open) => {},
      onContextMenuToggled: () => {},
      onInvalidConversation: () => {},
    };
    this.sidenavLayout.registerHost(host);
  }

  ngOnDestroy(): void {
    this.sidenavLayout.unregisterHost();
  }
}

