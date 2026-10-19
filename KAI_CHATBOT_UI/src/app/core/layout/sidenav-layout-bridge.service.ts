import { Injectable, signal } from '@angular/core';
import { SidenavComponent } from '@features/sidenav/sidenav.component';
import type { SidenavLayoutHost } from '@core/layout/sidenav-layout-host';

@Injectable({ providedIn: 'root' })
export class SidenavLayoutBridgeService {
  private readonly host = signal<SidenavLayoutHost | null>(null);
  readonly activeHost = this.host.asReadonly();

  private readonly sidenav = signal<SidenavComponent | null>(null);
  readonly sidenavCollapsed = signal(false);

  // For shared header
  readonly userInfo = signal<any>(null);
  readonly models = signal<any[]>([]);

  registerHost(h: SidenavLayoutHost) {
    this.host.set(h);
  }

  unregisterHost() {
    this.host.set(null);
  }

  setUserInfo(info: any) {
    this.userInfo.set(info);
  }

  setModels(models: any[]) {
    this.models.set(models);
  }

  setSidenavInstance(c: SidenavComponent | null) {
    this.sidenav.set(c);
    if (c) {
      this.sidenavCollapsed.set(c.collapsed);
    }
  }

  notifySidenavCollapsed(collapsed: boolean) {
    this.sidenavCollapsed.set(collapsed);
  }

  getSidenavInstance(): SidenavComponent | null {
    return this.sidenav();
  }

  readonly mobileSidebarOpen = signal(false);

  openMobileSidebar() {
    this.mobileSidebarOpen.set(true);
  }

  closeMobileSidebar() {
    this.mobileSidebarOpen.set(false);
  }
}
