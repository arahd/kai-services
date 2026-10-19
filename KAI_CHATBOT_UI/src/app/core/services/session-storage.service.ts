import { Injectable } from '@angular/core';

/**
 * Centralized enum for all sessionStorage keys used across the application.
 * Changing a key value here will update it everywhere automatically.
 */
export enum StorageKeys {
  CONVERSATION_ID = 'conversationID',
  LAST_ACTIVE_CONVERSATION_ID = 'lastActiveConversationID',
  KAI_FORCE_NEW_CHAT = 'kai_force_new_chat',
  KAI_PENDING_CHAT_SELECTION = 'kai_pending_chat_selection',
  JWT_TOKEN = 'jwt_token',
  USER_ROLES = 'userRoles',
  USER_INFO = 'userInfo',
  KAI_IS_BLOCKED = 'kai_is_blocked',
  KAI_HR_LINKEDIN_STATE = 'kai_hr_linkedin_state',
  PRODUCT_ROLES = 'product_roles',
  IS_AGENTS_ACCESSIBLE = 'kai_is_agents_accessible',
}

@Injectable({
  providedIn: 'root',
})
export class SessionStorageService {

  /**
   * Safe getter for items from sessionStorage.
   */
  getItem(key: StorageKeys | string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.error(`Error reading key "${key}" from sessionStorage:`, error);
      return null;
    }
  }

  /**
   * Safe setter for items in sessionStorage.
   */
  setItem(key: StorageKeys | string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error setting key "${key}" in sessionStorage:`, error);
    }
  }

  /**
   * Safe remover for items from sessionStorage.
   */
  removeItem(key: StorageKeys | string): void {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing key "${key}" from sessionStorage:`, error);
    }
  }

  /**
   * Safe clear for all sessionStorage items.
   */
  clear(): void {
    try {
      sessionStorage.clear();
    } catch (error) {
      console.error('Error clearing sessionStorage:', error);
    }
  }

  // --- Convenience Helper Methods ---

  getConversationId(): string | null {
    return this.getItem(StorageKeys.CONVERSATION_ID);
  }

  setConversationId(conversationId: string): void {
    this.setItem(StorageKeys.CONVERSATION_ID, conversationId);
  }

  removeConversationId(): void {
    this.removeItem(StorageKeys.CONVERSATION_ID);
  }

  getLastActiveConversationId(): string | null {
    return this.getItem(StorageKeys.LAST_ACTIVE_CONVERSATION_ID);
  }

  setLastActiveConversationId(conversationId: string): void {
    this.setItem(StorageKeys.LAST_ACTIVE_CONVERSATION_ID, conversationId);
  }

  removeLastActiveConversationId(): void {
    this.removeItem(StorageKeys.LAST_ACTIVE_CONVERSATION_ID);
  }

  getForceNewChat(): boolean {
    return this.getItem(StorageKeys.KAI_FORCE_NEW_CHAT) === 'true';
  }

  setForceNewChat(value: boolean): void {
    this.setItem(StorageKeys.KAI_FORCE_NEW_CHAT, value ? 'true' : 'false');
  }

  removeForceNewChat(): void {
    this.removeItem(StorageKeys.KAI_FORCE_NEW_CHAT);
  }

  getJwtToken(): string | null {
    return this.getItem(StorageKeys.JWT_TOKEN);
  }

  setJwtToken(token: string): void {
    this.setItem(StorageKeys.JWT_TOKEN, token);
  }

  removeJwtToken(): void {
    this.removeItem(StorageKeys.JWT_TOKEN);
  }

  getIsAgentsAccessible(): boolean {
    return this.getItem(StorageKeys.IS_AGENTS_ACCESSIBLE) === 'true';
  }

  setIsAgentsAccessible(value: boolean): void {
    this.setItem(StorageKeys.IS_AGENTS_ACCESSIBLE, value ? 'true' : 'false');
  }

  removeIsAgentsAccessible(): void {
    this.removeItem(StorageKeys.IS_AGENTS_ACCESSIBLE);
  }
}
