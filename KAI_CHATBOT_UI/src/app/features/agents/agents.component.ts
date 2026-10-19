import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import type { SidenavLayoutHost } from '@core/layout/sidenav-layout-host';
import { SessionStorageService } from '@core/services/session-storage.service';
import { AgentService } from './services/agent.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-agents',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="agents-container">
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

      .agents-container {
        width: 100%;
        height: 100%;
        flex: 1;
        min-height: 0;
        background-color: #ffffff;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
    `,
  ],
})
export class AgentsComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly sidenavLayout = inject(SidenavLayoutBridgeService);
  private readonly storageService = inject(SessionStorageService);
  private readonly agentService = inject(AgentService);

  private agentSidenavStreaming = false;

  ngOnInit(): void {
    const host: SidenavLayoutHost = {
      generatingStates: {},
      getStreaming: () => this.agentSidenavStreaming,
      handleStreamingToggle: (next) => {
        this.agentSidenavStreaming = next;
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
        }
        this.router.navigate(['/chatbot']);
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
