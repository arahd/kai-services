import { Component, inject, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import type { SidenavLayoutHost } from '@core/layout/sidenav-layout-host';
import { SessionStorageService } from '@core/services/session-storage.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private sidenavLayout = inject(SidenavLayoutBridgeService);
  private storageService = inject(SessionStorageService);

  ngOnInit() {
    const host: SidenavLayoutHost = {
      generatingStates: {},
      getStreaming: () => false,
      handleStreamingToggle: () => {},
      emitActiveChatOnInit: false,
      staticMode: false,
      onNewChat: () => this.onNewChatFromSidenav(),
      onChatSelected: (_chat: unknown) => {},
      onSearchModalToggle: (_open: boolean) => {},
      onContextMenuToggled: () => {},
      onInvalidConversation: () => {},
    };
    this.sidenavLayout.registerHost(host);
  }

  ngOnDestroy() {
    this.sidenavLayout.unregisterHost();
  }

  onNewChatFromSidenav() {
    // Force /chatbot to start a fresh chat, even if a stale conversationID exists.
    this.storageService.setForceNewChat(true);
    this.storageService.removeConversationId();
    this.storageService.removeLastActiveConversationId();
    this.router.navigate(['/chatbot']);
  }
}
