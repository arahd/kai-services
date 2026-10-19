import { getUserTimezone } from './timezone.util';

describe('getUserTimezone', () => {
  it('should return a non-empty string for the timezone', () => {
    const tz = getUserTimezone();
    expect(tz).toBeTruthy();
    expect(typeof tz).toBe('string');
  });

  it('should return UTC if Intl is unavailable or throws', () => {
    const originalDateTimeFormat = Intl.DateTimeFormat;
    try {
      (Intl as any).DateTimeFormat = () => {
        throw new Error('Intl error');
      };
      expect(getUserTimezone()).toBe('UTC');
    } finally {
      Intl.DateTimeFormat = originalDateTimeFormat;
    }
  });
});
