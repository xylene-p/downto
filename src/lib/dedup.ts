// Dedup: Supabase webhooks can double-fire for the same notification row.
// Track recently processed notification IDs in memory (TTL 60s).
const recentlySent = new Map<string, number>();

const TTL_MS = 60_000;

/**
 * Returns true if this ID was already seen within the TTL window (duplicate).
 * Returns false on first call (not a duplicate) and records the ID.
 */
export function dedup(notificationId: string, now = Date.now()): boolean {
  // Evict stale entries
  for (const [id, ts] of recentlySent) {
    if (now - ts > TTL_MS) recentlySent.delete(id);
  }
  if (recentlySent.has(notificationId)) return true;
  recentlySent.set(notificationId, now);
  return false;
}

/** Clear all entries — for testing only */
export function _resetDedup(): void {
  recentlySent.clear();
}
