import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { LocalStorageService, LocalStorageKeys } from './local-storage.service';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorTheme = 'default' | 'ocean' | 'sunset' | 'violet' | 'rose' | 'midnight';
export type FontFamily = 
  | 'inter' 
  | 'manrope' 
  | 'outfit' 
  | 'plus-jakarta' 
  | 'roboto'
  | 'dm-sans'
  | 'ginto'
  | 'gotham'
  | 'avenir-next'
  | 'maison-neue'
  | 'apercu'
  | 'benton-sans'
  | 'din-next'
  | 'helvetica-now'
  | 'futura-now'
  | 'knockout'
  | 'axiforma'
  | 'segoe-ui'
  | 'open-sans'
  | 'poppins'
  | 'source-sans-pro'
  | 'lato'
  | 'system-font-stack'
  | 'system';

export interface FontFamilyOption {
  key: FontFamily;
  label: string;
  family: string;
}

export const FONT_FAMILIES: FontFamilyOption[] = [
  { key: 'inter', label: 'Inter', family: '"Inter", sans-serif' },
  { key: 'manrope', label: 'Manrope', family: '"Manrope", sans-serif' },
  { key: 'outfit', label: 'Outfit', family: '"Outfit", sans-serif' },
  { key: 'plus-jakarta', label: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif' },
  { key: 'roboto', label: 'Roboto', family: '"Roboto", sans-serif' },
  { key: 'dm-sans', label: 'DM Sans', family: '"DM Sans", sans-serif' },
  { key: 'ginto', label: 'Ginto', family: '"Ginto", "Space Grotesk", sans-serif' },
  { key: 'gotham', label: 'Gotham', family: '"Gotham", "Montserrat", sans-serif' },
  { key: 'avenir-next', label: 'Avenir Next', family: '"Avenir Next", "Avenir", "Montserrat", sans-serif' },
  { key: 'maison-neue', label: 'Maison Neue', family: '"Maison Neue", "Albert Sans", "DM Sans", sans-serif' },
  { key: 'apercu', label: 'Apercu', family: '"Apercu", "DM Sans", sans-serif' },
  { key: 'benton-sans', label: 'Benton Sans', family: '"Benton Sans", "Public Sans", sans-serif' },
  { key: 'din-next', label: 'DIN Next', family: '"DIN Next", "Barlow", sans-serif' },
  { key: 'helvetica-now', label: 'Helvetica Now', family: '"Helvetica Now", "Helvetica Neue", "Helvetica", "Arial", sans-serif' },
  { key: 'futura-now', label: 'Futura Now', family: '"Futura Now", "Futura", "Jost", sans-serif' },
  { key: 'knockout', label: 'Knockout', family: '"Knockout", "Antonio", "Oswald", sans-serif' },
  { key: 'axiforma', label: 'Axiforma', family: '"Axiforma", "Poppins", "Outfit", sans-serif' },
  { key: 'segoe-ui', label: 'Segoe UI', family: '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif' },
  { key: 'open-sans', label: 'Open Sans', family: '"Open Sans", sans-serif' },
  { key: 'poppins', label: 'Poppins', family: '"Poppins", sans-serif' },
  { key: 'source-sans-pro', label: 'Source Sans Pro', family: '"Source Sans Pro", "Source Sans 3", sans-serif' },
  { key: 'lato', label: 'Lato', family: '"Lato", sans-serif' },
  { key: 'system-font-stack', label: 'System font stack', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { key: 'system', label: 'System Sans', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
];

export interface ThemePalette {
  label: string;
  accent: string;       // Preview swatch color
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** Curated color theme palettes – each provides light + dark variant values. */
export const THEME_PALETTES: Record<ColorTheme, ThemePalette> = {
  default: {
    label: 'Default',
    accent: '#10a37f',
    light: {
      '--px-bg': '#ffffff',
      '--px-panel': '#f9f9f9',
      '--px-soft': '#f4f4f4',
      '--px-border': '#e5e5e5',
      '--px-text': '#0d0d0d',
      '--px-muted': '#676767',
      '--px-accent': '#10a37f',
      '--px-hover': '#ececec',
    },
    dark: {
      '--px-bg': '#212121',
      '--px-panel': '#171717',
      '--px-soft': '#2f2f2f',
      '--px-border': '#2f2f2f',
      '--px-text': '#ececec',
      '--px-muted': '#b4b4b4',
      '--px-accent': '#10a37f',
      '--px-hover': '#2f2f2f',
    },
  },
  ocean: {
    label: 'Ocean',
    accent: '#0ea5e9',
    light: {
      '--px-bg': '#ffffff',
      '--px-panel': '#f0f9ff',
      '--px-soft': '#e0f2fe',
      '--px-border': '#bae6fd',
      '--px-text': '#0c4a6e',
      '--px-muted': '#64748b',
      '--px-accent': '#0ea5e9',
      '--px-hover': '#e0f2fe',
    },
    dark: {
      '--px-bg': '#0c1a2a',
      '--px-panel': '#0a1628',
      '--px-soft': '#1e3a5f',
      '--px-border': '#1e3a5f',
      '--px-text': '#e0f2fe',
      '--px-muted': '#94a3b8',
      '--px-accent': '#38bdf8',
      '--px-hover': '#1e3a5f',
    },
  },
  sunset: {
    label: 'Sunset',
    accent: '#f97316',
    light: {
      '--px-bg': '#fffbf5',
      '--px-panel': '#fff7ed',
      '--px-soft': '#ffedd5',
      '--px-border': '#fed7aa',
      '--px-text': '#431407',
      '--px-muted': '#78716c',
      '--px-accent': '#f97316',
      '--px-hover': '#ffedd5',
    },
    dark: {
      '--px-bg': '#1c1412',
      '--px-panel': '#1a1210',
      '--px-soft': '#3d2a1e',
      '--px-border': '#3d2a1e',
      '--px-text': '#ffedd5',
      '--px-muted': '#a8a29e',
      '--px-accent': '#fb923c',
      '--px-hover': '#3d2a1e',
    },
  },
  violet: {
    label: 'Violet',
    accent: '#8b5cf6',
    light: {
      '--px-bg': '#fefbff',
      '--px-panel': '#f5f3ff',
      '--px-soft': '#ede9fe',
      '--px-border': '#ddd6fe',
      '--px-text': '#1e1b4b',
      '--px-muted': '#6b7280',
      '--px-accent': '#8b5cf6',
      '--px-hover': '#ede9fe',
    },
    dark: {
      '--px-bg': '#1a1625',
      '--px-panel': '#15111f',
      '--px-soft': '#2e2548',
      '--px-border': '#2e2548',
      '--px-text': '#ede9fe',
      '--px-muted': '#a5b4fc',
      '--px-accent': '#a78bfa',
      '--px-hover': '#2e2548',
    },
  },
  rose: {
    label: 'Rose',
    accent: '#f43f5e',
    light: {
      '--px-bg': '#fffbfb',
      '--px-panel': '#fff1f2',
      '--px-soft': '#ffe4e6',
      '--px-border': '#fecdd3',
      '--px-text': '#4c0519',
      '--px-muted': '#71717a',
      '--px-accent': '#f43f5e',
      '--px-hover': '#ffe4e6',
    },
    dark: {
      '--px-bg': '#1c1215',
      '--px-panel': '#1a1013',
      '--px-soft': '#3d1f28',
      '--px-border': '#3d1f28',
      '--px-text': '#ffe4e6',
      '--px-muted': '#a1a1aa',
      '--px-accent': '#fb7185',
      '--px-hover': '#3d1f28',
    },
  },
  midnight: {
    label: 'Midnight',
    accent: '#6366f1',
    light: {
      '--px-bg': '#fefefe',
      '--px-panel': '#f5f5ff',
      '--px-soft': '#eef2ff',
      '--px-border': '#c7d2fe',
      '--px-text': '#1e1b4b',
      '--px-muted': '#6b7280',
      '--px-accent': '#6366f1',
      '--px-hover': '#eef2ff',
    },
    dark: {
      '--px-bg': '#111118',
      '--px-panel': '#0d0d14',
      '--px-soft': '#1e1e3a',
      '--px-border': '#1e1e3a',
      '--px-text': '#e0e7ff',
      '--px-muted': '#94a3b8',
      '--px-accent': '#818cf8',
      '--px-hover': '#1e1e3a',
    },
  },
};

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly doc = inject(DOCUMENT);
  private readonly storageService = inject(LocalStorageService);
  private readonly STORAGE_KEY = LocalStorageKeys.KAI_THEME;
  private readonly COLOR_THEME_KEY = LocalStorageKeys.KAI_COLOR_THEME;
  private readonly FONT_FAMILY_KEY = LocalStorageKeys.KAI_FONT_FAMILY;
  private readonly router = inject(Router, { optional: true });

  // Signal holding the user's explicit preference ('light', 'dark', 'system')
  readonly themeSignal = signal<ThemeMode>('system');

  // Signal holding the active color theme
  readonly colorThemeSignal = signal<ColorTheme>('default');

  // Signal holding the active font family
  readonly fontFamilySignal = signal<FontFamily>('inter');

  private mediaQueryListener?: (e: MediaQueryListEvent) => void;

  constructor() {
    this.initTheme();
  }

  private initTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    let savedTheme: ThemeMode = 'system';
    const savedMode = this.storageService.getItem(this.STORAGE_KEY);
    if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
      savedTheme = savedMode;
    }

    // Load saved color theme
    let savedColorTheme: ColorTheme = 'default';
    const savedColor = this.storageService.getItem(this.COLOR_THEME_KEY);
    if (savedColor && savedColor in THEME_PALETTES) {
      savedColorTheme = savedColor as ColorTheme;
    }

    // Load saved font family
    let savedFontFamily: FontFamily = 'inter';
    const savedFont = this.storageService.getItem(this.FONT_FAMILY_KEY);
    if (savedFont && FONT_FAMILIES.some(f => f.key === savedFont)) {
      savedFontFamily = savedFont as FontFamily;
    }

    this.themeSignal.set(savedTheme);
    this.colorThemeSignal.set(savedColorTheme);
    this.fontFamilySignal.set(savedFontFamily);
    this.applyTheme(savedTheme);

    // Check initial route to apply appropriate theme changes
    const initialUrl = this.router ? this.router.url : '/';
    this.updateActiveThemeForUrl(initialUrl);

    // Listen for route changes to update applied themes dynamically
    if (this.router) {
      this.router.events
        .pipe(
          filter((e): e is NavigationEnd => e instanceof NavigationEnd)
        )
        .subscribe((e) => {
          this.updateActiveThemeForUrl(e.urlAfterRedirects);
        });
    }

    // Set up OS media query listener to automatically apply theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQueryListener = (e: MediaQueryListEvent) => {
      const path = this.router?.url?.split('?')[0] || '';
      const isThemeSupported = this.isThemeSupportedUrl(path);
      if (isThemeSupported) {
        if (this.themeSignal() === 'system') {
          this.updateDocumentClass(e.matches ? 'dark' : 'light');
          this.applyColorThemeVars(this.colorThemeSignal(), e.matches ? 'dark' : 'light');
        }
      } else {
        this.updateDocumentClass('light');
        this.applyColorThemeVars('default', 'light');
      }
    };

    try {
      mediaQuery.addEventListener('change', this.mediaQueryListener);
    } catch {
      // Fallback for older browsers
      (mediaQuery as any).addListener(this.mediaQueryListener);
    }
  }

  isThemeSupportedUrl(url: string): boolean {
    const path = (url || '').split('?')[0].split('#')[0];
    return (
      path === '/chatbot' ||
      path.startsWith('/chatbot/') ||
      path === '/product' ||
      path.startsWith('/product/') ||
      path === '/products-admin' ||
      path.startsWith('/products-admin/') ||
      path === '/projects' ||
      path.startsWith('/projects/')
    );
  }

  setTheme(theme: ThemeMode): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.themeSignal.set(theme);
    this.storageService.setItem(this.STORAGE_KEY, theme);

    this.applyTheme(theme);
    // Re-apply color theme vars for the new resolved mode
    const resolvedMode = this.getResolvedMode(theme);
    const path = this.router?.url?.split('?')[0] || '';
    const currentActiveColorTheme = this.isThemeSupportedUrl(path) ? this.colorThemeSignal() : 'default';
    this.applyColorThemeVars(currentActiveColorTheme, resolvedMode);
  }

  setColorTheme(colorTheme: ColorTheme): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.colorThemeSignal.set(colorTheme);
    this.storageService.setItem(this.COLOR_THEME_KEY, colorTheme);

    const path = this.router?.url?.split('?')[0] || '';
    if (this.isThemeSupportedUrl(path)) {
      this.applyColorTheme(colorTheme);
    }
  }

  setFontFamily(fontKey: FontFamily): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.fontFamilySignal.set(fontKey);
    this.storageService.setItem(this.FONT_FAMILY_KEY, fontKey);

    const path = this.router?.url?.split('?')[0] || '';
    if (this.isThemeSupportedUrl(path)) {
      this.applyFontFamily(fontKey);
    }
  }

  updateActiveThemeForUrl(url: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.isThemeSupportedUrl(url)) {
      this.applyTheme(this.themeSignal());
      this.applyColorTheme(this.colorThemeSignal());
      this.applyFontFamily(this.fontFamilySignal());
    } else {
      this.applyTheme('light');
      this.applyColorTheme('default');
      this.applyFontFamily('inter');
    }
  }

  private applyFontFamily(fontKey: FontFamily): void {
    const font = FONT_FAMILIES.find((f) => f.key === fontKey);
    if (!font) return;

    const root = this.doc.documentElement;
    if (root) {
      root.style.setProperty('--px-font', font.family);
      root.setAttribute('data-font-family', fontKey);
    }
  }

  private applyTheme(theme: ThemeMode): void {
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.updateDocumentClass(isDark ? 'dark' : 'light');
    } else {
      this.updateDocumentClass(theme);
    }
  }

  private applyColorTheme(colorTheme: ColorTheme): void {
    const path = this.router?.url?.split('?')[0] || '';
    const isThemeSupported = this.isThemeSupportedUrl(path);
    const activeThemeSignal = isThemeSupported ? this.themeSignal() : 'light';
    const resolvedMode = this.getResolvedMode(activeThemeSignal);
    this.applyColorThemeVars(colorTheme, resolvedMode);

    // Set data attribute for any CSS-level selectors
    const root = this.doc.documentElement;
    if (root) {
      root.setAttribute('data-color-theme', colorTheme);
    }
  }

  private applyColorThemeVars(colorTheme: ColorTheme, mode: 'light' | 'dark'): void {
    const palette = THEME_PALETTES[colorTheme];
    if (!palette) return;

    const vars = mode === 'dark' ? palette.dark : palette.light;
    const root = this.doc.documentElement;
    if (!root) return;

    Object.entries(vars).forEach(([prop, value]) => {
      root.style.setProperty(prop, value);
    });
  }

  private getResolvedMode(theme: ThemeMode): 'light' | 'dark' {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }

  private updateDocumentClass(resolvedTheme: 'light' | 'dark'): void {
    const root = this.doc.documentElement;
    if (root) {
      root.classList.toggle('dark', resolvedTheme === 'dark');
    }
  }
}
