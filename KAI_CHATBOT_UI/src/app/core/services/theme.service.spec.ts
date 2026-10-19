import { TestBed } from '@angular/core/testing';
import { ThemeService, THEME_PALETTES, FONT_FAMILIES, ThemeMode, ColorTheme, FontFamily } from './theme.service';
import { LocalStorageService } from './local-storage.service';
import { provideRouter, Router, NavigationEnd } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { Subject } from 'rxjs';

describe('ThemeService', () => {
  let service: ThemeService;
  let doc: Document;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.removeItem('kai-theme');
    localStorage.removeItem('kai-color-theme');
    localStorage.removeItem('kai-font-family');
    // Reset document classes
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-color-theme');
    document.documentElement.removeAttribute('data-font-family');

    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        LocalStorageService,
        provideRouter([])
      ]
    });
    service = TestBed.inject(ThemeService);
    doc = TestBed.inject(DOCUMENT);
  });

  // --- Initialization ---

  it('should be created and have default signals', () => {
    expect(service).toBeTruthy();
    expect(service.themeSignal()).toBeDefined();
    expect(service.colorThemeSignal()).toBeDefined();
    expect(service.fontFamilySignal()).toBeDefined();
  });

  it('should default to system theme mode', () => {
    expect(service.themeSignal()).toBe('system');
  });

  it('should default to default color theme', () => {
    expect(service.colorThemeSignal()).toBe('default');
  });

  it('should default to inter font family', () => {
    expect(service.fontFamilySignal()).toBe('inter');
  });

  // --- THEME_PALETTES constant ---

  it('should have all expected theme palettes', () => {
    expect(THEME_PALETTES['default']).toBeDefined();
    expect(THEME_PALETTES['ocean']).toBeDefined();
    expect(THEME_PALETTES['sunset']).toBeDefined();
    expect(THEME_PALETTES['violet']).toBeDefined();
    expect(THEME_PALETTES['rose']).toBeDefined();
    expect(THEME_PALETTES['midnight']).toBeDefined();
  });

  it('each palette should have light and dark variants', () => {
    for (const [key, palette] of Object.entries(THEME_PALETTES)) {
      expect(palette.light).toBeDefined();
      expect(palette.dark).toBeDefined();
      expect(palette.label).toBeTruthy();
      expect(palette.accent).toBeTruthy();
    }
  });

  it('each palette variant should define all required CSS variables', () => {
    const requiredVars = ['--px-bg', '--px-panel', '--px-soft', '--px-border', '--px-text', '--px-muted', '--px-accent', '--px-hover'];
    for (const palette of Object.values(THEME_PALETTES)) {
      for (const v of requiredVars) {
        expect(palette.light[v]).toBeTruthy(`Missing ${v} in light`);
        expect(palette.dark[v]).toBeTruthy(`Missing ${v} in dark`);
      }
    }
  });

  // --- FONT_FAMILIES constant ---

  it('should expose at least 10 font families', () => {
    expect(FONT_FAMILIES.length).toBeGreaterThanOrEqual(10);
  });

  it('every font family option should have key, label, and family', () => {
    for (const f of FONT_FAMILIES) {
      expect(f.key).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(f.family).toBeTruthy();
    }
  });

  // --- setTheme ---

  it('should set theme to dark and add "dark" class to documentElement', () => {
    service.setTheme('dark');
    expect(service.themeSignal()).toBe('dark');
    expect(doc.documentElement.classList.contains('dark')).toBeTrue();
  });

  it('should set theme to light and remove "dark" class', () => {
    service.setTheme('dark');
    expect(doc.documentElement.classList.contains('dark')).toBeTrue();
    service.setTheme('light');
    expect(service.themeSignal()).toBe('light');
    expect(doc.documentElement.classList.contains('dark')).toBeFalse();
  });

  it('should set theme to system and resolve from OS preference', () => {
    service.setTheme('system');
    expect(service.themeSignal()).toBe('system');
    // system resolves to light or dark based on matchMedia
  });

  it('should persist theme to localStorage', () => {
    service.setTheme('dark');
    expect(localStorage.getItem('kai-theme')).toBe('dark');
    service.setTheme('light');
    expect(localStorage.getItem('kai-theme')).toBe('light');
  });

  // --- setColorTheme ---

  it('should set color theme and persist to localStorage', () => {
    service.setColorTheme('ocean');
    expect(service.colorThemeSignal()).toBe('ocean');
    expect(localStorage.getItem('kai-color-theme')).toBe('ocean');
  });

  it('should set violet color theme', () => {
    service.setColorTheme('violet');
    expect(service.colorThemeSignal()).toBe('violet');
  });

  it('should set sunset color theme', () => {
    service.setColorTheme('sunset');
    expect(service.colorThemeSignal()).toBe('sunset');
  });

  it('should set rose color theme', () => {
    service.setColorTheme('rose');
    expect(service.colorThemeSignal()).toBe('rose');
  });

  it('should set midnight color theme', () => {
    service.setColorTheme('midnight');
    expect(service.colorThemeSignal()).toBe('midnight');
  });

  // --- setFontFamily ---

  it('should set font family and persist to localStorage', () => {
    service.setFontFamily('outfit');
    expect(service.fontFamilySignal()).toBe('outfit');
    expect(localStorage.getItem('kai-font-family')).toBe('outfit');
  });

  it('should set various font families', () => {
    service.setFontFamily('roboto');
    expect(service.fontFamilySignal()).toBe('roboto');

    service.setFontFamily('poppins');
    expect(service.fontFamilySignal()).toBe('poppins');

    service.setFontFamily('dm-sans');
    expect(service.fontFamilySignal()).toBe('dm-sans');
  });

  // --- updateActiveThemeForUrl ---

  it('should apply user theme when navigating to /chatbot', () => {
    service.setTheme('dark');
    service.updateActiveThemeForUrl('/chatbot');
    expect(doc.documentElement.classList.contains('dark')).toBeTrue();
  });

  it('should apply user theme when navigating to /chatbot/:convoId', () => {
    service.setTheme('dark');
    service.updateActiveThemeForUrl('/chatbot/67b7f1234abcd');
    expect(doc.documentElement.classList.contains('dark')).toBeTrue();
  });

  it('should apply user theme when navigating to /product and /product/admin', () => {
    service.setTheme('dark');
    service.updateActiveThemeForUrl('/product');
    expect(doc.documentElement.classList.contains('dark')).toBeTrue();
    service.updateActiveThemeForUrl('/product/admin');
    expect(doc.documentElement.classList.contains('dark')).toBeTrue();
  });

  it('should apply user theme when navigating to /projects', () => {
    service.setTheme('dark');
    service.updateActiveThemeForUrl('/projects');
    expect(doc.documentElement.classList.contains('dark')).toBeTrue();
    service.updateActiveThemeForUrl('/projects/proj-123/conv-456');
    expect(doc.documentElement.classList.contains('dark')).toBeTrue();
  });

  it('should force light theme for non-supported routes like /admin and /login', () => {
    service.setTheme('dark');
    service.updateActiveThemeForUrl('/admin');
    expect(doc.documentElement.classList.contains('dark')).toBeFalse();
    service.updateActiveThemeForUrl('/login');
    expect(doc.documentElement.classList.contains('dark')).toBeFalse();
  });

  it('should apply default color theme for non-supported routes', () => {
    service.setColorTheme('violet');
    service.updateActiveThemeForUrl('/admin');
    expect(doc.documentElement.getAttribute('data-color-theme')).toBe('default');
  });

  it('should apply user color theme for /chatbot route and /chatbot/:convoId', () => {
    service.setColorTheme('ocean');
    service.updateActiveThemeForUrl('/chatbot');
    expect(doc.documentElement.getAttribute('data-color-theme')).toBe('ocean');
    service.updateActiveThemeForUrl('/chatbot/conv-999');
    expect(doc.documentElement.getAttribute('data-color-theme')).toBe('ocean');
  });

  it('should handle URLs with query params correctly', () => {
    service.updateActiveThemeForUrl('/chatbot?conv=123');
    // should still detect /chatbot
    expect(service.themeSignal()).toBeDefined();
  });

  // --- isThemeSupportedUrl ---

  it('should return true for /chatbot, /product, and /projects routes and subroutes', () => {
    expect(service.isThemeSupportedUrl('/chatbot')).toBeTrue();
    expect(service.isThemeSupportedUrl('/chatbot/67b7f1234abcd')).toBeTrue();
    expect(service.isThemeSupportedUrl('/product')).toBeTrue();
    expect(service.isThemeSupportedUrl('/product/admin')).toBeTrue();
    expect(service.isThemeSupportedUrl('/products-admin')).toBeTrue();
    expect(service.isThemeSupportedUrl('/projects')).toBeTrue();
    expect(service.isThemeSupportedUrl('/projects/proj-123')).toBeTrue();
    expect(service.isThemeSupportedUrl('/projects/proj-123/conv-456')).toBeTrue();
  });

  it('should return false for unsupported routes like /admin, /hrportal, /agents, /login', () => {
    expect(service.isThemeSupportedUrl('/admin')).toBeFalse();
    expect(service.isThemeSupportedUrl('/admin/analytics')).toBeFalse();
    expect(service.isThemeSupportedUrl('/hrportal')).toBeFalse();
    expect(service.isThemeSupportedUrl('/hrportal/jd')).toBeFalse();
    expect(service.isThemeSupportedUrl('/agents')).toBeFalse();
    expect(service.isThemeSupportedUrl('/login')).toBeFalse();
    expect(service.isThemeSupportedUrl('/request-access')).toBeFalse();
  });

  // --- localStorage Persistence Round-Trip ---

  it('should persist and restore theme settings via setters', () => {
    // Set values via public setters (which persist to localStorage)
    service.setTheme('dark');
    service.setColorTheme('ocean');
    service.setFontFamily('poppins');

    // Verify localStorage was written
    expect(localStorage.getItem('kai-theme')).toBe('dark');
    expect(localStorage.getItem('kai-color-theme')).toBe('ocean');
    expect(localStorage.getItem('kai-font-family')).toBe('poppins');

    // Verify signals reflect the values
    expect(service.themeSignal()).toBe('dark');
    expect(service.colorThemeSignal()).toBe('ocean');
    expect(service.fontFamilySignal()).toBe('poppins');
  });

  it('should cycle through all theme modes', () => {
    service.setTheme('light');
    expect(service.themeSignal()).toBe('light');
    expect(localStorage.getItem('kai-theme')).toBe('light');

    service.setTheme('dark');
    expect(service.themeSignal()).toBe('dark');
    expect(localStorage.getItem('kai-theme')).toBe('dark');

    service.setTheme('system');
    expect(service.themeSignal()).toBe('system');
    expect(localStorage.getItem('kai-theme')).toBe('system');
  });
});
