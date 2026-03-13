/**
 * Test CodeLens Utilities
 *
 * Shared formatting helpers for test-related UI components.
 */

/**
 * Format a timestamp as a relative time string.
 */
export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 120) return "1 minute ago";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 7200) return "1 hour ago";
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return date.toLocaleDateString();
}

/**
 * Truncate a string to a maximum length.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

