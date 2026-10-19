import { Injectable } from '@angular/core';

/**
 * Centralized enum for all localStorage keys used across the application.
 * Modifying a key here will transparently update it application-wide.
 */
export enum LocalStorageKeys {
  KAI_THEME = 'kai-theme',
  KAI_COLOR_THEME = 'kai-color-theme',
  KAI_FONT_FAMILY = 'kai-font-family',
  HAS_SEEN_CHATBOT_TOUR = 'has_seen_chatbot_tour',
}

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {

  /**
   * Safe getter for items from localStorage.
   */
  getItem(key: LocalStorageKeys | string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Error reading key "${key}" from localStorage:`, error);
      return null;
    }
  }

  /**
   * Safe setter for items in localStorage.
   */
  setItem(key: LocalStorageKeys | string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error setting key "${key}" in localStorage:`, error);
    }
  }

  /**
   * Safe remover for items from localStorage.
   */
  removeItem(key: LocalStorageKeys | string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing key "${key}" from localStorage:`, error);
    }
  }

  /**
   * Safe clear for all localStorage items.
   */
  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  }

  /**
   * Safe key iteration for localStorage.
   */
  keys(): string[] {
    try {
      return Object.keys(localStorage);
    } catch (error) {
      console.error('Error listing localStorage keys:', error);
      return [];
    }
  }

  // --- Convenience Helper Methods ---

  getTheme(): string | null {
    return this.getItem(LocalStorageKeys.KAI_THEME);
  }

  setTheme(theme: string): void {
    this.setItem(LocalStorageKeys.KAI_THEME, theme);
  }

  getColorTheme(): string | null {
    return this.getItem(LocalStorageKeys.KAI_COLOR_THEME);
  }

  setColorTheme(colorTheme: string): void {
    this.setItem(LocalStorageKeys.KAI_COLOR_THEME, colorTheme);
  }

  getFontFamily(): string | null {
    return this.getItem(LocalStorageKeys.KAI_FONT_FAMILY);
  }

  setFontFamily(fontFamily: string): void {
    this.setItem(LocalStorageKeys.KAI_FONT_FAMILY, fontFamily);
  }

  getHasSeenTour(): boolean {
    return this.getItem(LocalStorageKeys.HAS_SEEN_CHATBOT_TOUR) === 'true';
  }

  setHasSeenTour(seen: boolean = true): void {
    this.setItem(LocalStorageKeys.HAS_SEEN_CHATBOT_TOUR, seen ? 'true' : 'false');
  }
}
