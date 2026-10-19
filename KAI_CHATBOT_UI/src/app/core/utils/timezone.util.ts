/**
 * Safely resolves the browser's IANA timezone identifier (e.g. 'Asia/Kolkata', 'America/New_York').
 * Returns 'UTC' as a safe fallback if the environment does not support Intl.
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
