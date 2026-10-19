import { TestBed } from '@angular/core/testing';
import { LocalStorageService, LocalStorageKeys } from './local-storage.service';

describe('LocalStorageService', () => {
  let service: LocalStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LocalStorageService],
    });
    service = TestBed.inject(LocalStorageService);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set and get item using LocalStorageKeys enum', () => {
    service.setItem(LocalStorageKeys.KAI_THEME, 'dark');
    expect(service.getItem(LocalStorageKeys.KAI_THEME)).toBe('dark');
  });

  it('should remove item', () => {
    service.setItem(LocalStorageKeys.KAI_THEME, 'dark');
    service.removeItem(LocalStorageKeys.KAI_THEME);
    expect(service.getItem(LocalStorageKeys.KAI_THEME)).toBeNull();
  });

  it('should clear all items', () => {
    service.setItem(LocalStorageKeys.KAI_THEME, 'dark');
    service.setItem(LocalStorageKeys.KAI_COLOR_THEME, 'ocean');
    service.clear();
    expect(service.getItem(LocalStorageKeys.KAI_THEME)).toBeNull();
    expect(service.getItem(LocalStorageKeys.KAI_COLOR_THEME)).toBeNull();
  });

  it('should handle convenience methods for theme', () => {
    service.setTheme('light');
    expect(service.getTheme()).toBe('light');
  });

  it('should handle convenience methods for colorTheme', () => {
    service.setColorTheme('emerald');
    expect(service.getColorTheme()).toBe('emerald');
  });

  it('should handle convenience methods for fontFamily', () => {
    service.setFontFamily('outfit');
    expect(service.getFontFamily()).toBe('outfit');
  });

  it('should handle convenience methods for tour state', () => {
    service.setHasSeenTour(true);
    expect(service.getHasSeenTour()).toBeTrue();
  });

  it('should list all keys using keys() method', () => {
    service.setItem('test_key_1', 'val1');
    service.setItem('test_key_2', 'val2');
    const keys = service.keys();
    expect(keys).toContain('test_key_1');
    expect(keys).toContain('test_key_2');
  });
});
