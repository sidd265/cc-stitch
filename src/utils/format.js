import { format as fnsFormat } from 'date-fns';

/**
 * Format a token count for display (e.g. 12.3K, 1.2M).
 */
export function formatTokens(count) {
  if (count == null) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/**
 * Format a cost in USD.
 */
export function formatCost(amount) {
  if (amount == null || amount === 0) return '$0.00';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

/**
 * Format a duration in milliseconds to human-readable (e.g. "2h 15m").
 */
export function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Format a date for display.
 */
export function formatDate(dateOrTs) {
  if (!dateOrTs) return 'Unknown';
  const d = typeof dateOrTs === 'string' ? new Date(dateOrTs) : new Date(dateOrTs);
  if (isNaN(d.getTime())) return 'Unknown';
  return fnsFormat(d, 'yyyy-MM-dd HH:mm');
}

/**
 * Format a file size in bytes.
 */
export function formatSize(bytes) {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
