import { Injectable } from '@angular/core';

export interface SidenavCacheState {
  userEmail: string | null;
  chats: any[];
  activeConversationID: string | null;
  currentPage: number;
  totalPages: number;
  showHistorySection: boolean;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class SidenavCacheService {
  private state: SidenavCacheState | null = null;

  get(): SidenavCacheState | null {
    return this.state;
  }

  set(next: SidenavCacheState) {
    this.state = next;
  }

  clear() {
    this.state = null;
  }
}

