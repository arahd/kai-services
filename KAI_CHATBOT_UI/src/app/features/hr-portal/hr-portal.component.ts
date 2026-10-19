import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterOutlet } from '@angular/router';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import type { SidenavLayoutHost } from '@core/layout/sidenav-layout-host';
import { PopupService } from '@features/hr-portal/hr-portal-services/popup.service';
import { HrPermissionService } from '@features/hr-portal/hr-portal-services/hr-permission.service';
import { TokenService } from '@core/services/token.service';
import { SessionStorageService } from '@core/services/session-storage.service';

type TActiveCard = 'jd' | 'linkedin' | '';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-hr-portal',
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
  ],
  templateUrl: './hr-portal.component.html',
  styleUrls: ['./hr-portal.component.scss'],
})
export class HrPortalComponent implements OnInit, OnDestroy {
  private popupService = inject(PopupService);
  private hrPermissionService = inject(HrPermissionService);
  private router = inject(Router);
  private sidenavLayout = inject(SidenavLayoutBridgeService);
  private tokenService = inject(TokenService);
  private storageService = inject(SessionStorageService);

  popupActiveStatus = this.popupService.popupState;

  isAdmin = signal(false);
  isHrAdmin = signal(false);
  isUser = signal(false);
  userInfo: any = null;

  isHistoryOpen = signal(false);
  private   hrSidenavStreaming = false;

  toggleHistory() {
    this.isHistoryOpen.update((v: boolean) => !v);
  }

  constructor() {
    // Keep route strictly synced with the popup service (preserves existing component behavior).
    effect(() => {
      const popupName = this.popupService.activePopup();
      if (popupName) {
        const mode = popupName as TActiveCard;
        if (mode === 'jd') {
          this.router.navigate(['/hrportal/jd']);
        } else if (mode === 'linkedin') {
          this.router.navigate(['/hrportal/linkedin']);
        }
      }
    });
  }

  ngOnInit() {
    this.isAdmin.set(this.tokenService.isAdmin());
    this.isHrAdmin.set(this.tokenService.isHrAdmin());
    this.isUser.set(this.tokenService.isUser());

    // Load HR portal access control permissions
    if (this.isHrAdmin()) {
      this.hrPermissionService.loadAccessControl().subscribe();
    }

    // Provide userInfo for the greeting header (same as chatbot).
    this.userInfo = this.tokenService.getUserInfo();

    const host: SidenavLayoutHost = {
      generatingStates: {},
      getStreaming: () => this.hrSidenavStreaming,
      handleStreamingToggle: (next) => this.onStreamingToggleFromSidenav(next),
      emitActiveChatOnInit: false,
      staticMode: false,
      onNewChat: () => this.onNewChatFromSidenav(),
      onChatSelected: (chat) => this.onChatSelectedFromSidenav(chat as any),
      onSearchModalToggle: (open) => this.onSearchModalToggleFromSidenav(open),
      onContextMenuToggled: () => {},
      onInvalidConversation: () => {},
    };
    this.sidenavLayout.registerHost(host);
  }

  ngOnDestroy() {
    this.sidenavLayout.unregisterHost();
  }

  openPopup(mode: TActiveCard) {
    this.popupService.setActivePopup(mode);
    this.popupService.openPopup();
  }

  closePopup() {
    this.popupService.closePopup();
  }

  // Keep chatbot sidenav behavior consistent: send user back to /chatbot for chat interactions.
  onNewChatFromSidenav() {
    this.storageService.removeConversationId();
    this.storageService.removeLastActiveConversationId();
    this.router.navigate(['/chatbot']);
  }

  onChatSelectedFromSidenav(chat: any) {
    const cid = chat?.conversationID;
    if (cid) {
      this.storageService.setConversationId(cid);
      this.storageService.setLastActiveConversationId(cid);
    }
    // One-shot handoff so Chatbot page can load the selected chat immediately.
    // try {
    //   sessionStorage.setItem('kai_pending_chat_selection', JSON.stringify(chat ?? {}));
    // } catch {
    //   // ignore
    // }
    this.router.navigate(['/chatbot']);
  }

  onSearchModalToggleFromSidenav(_open: boolean) {
    // No-op for HR portal
  }

  onStreamingToggleFromSidenav(next: boolean) {
    this.hrSidenavStreaming = next;
  }
}
