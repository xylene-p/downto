// Dedup: Supabase webhooks can double-fire for the same notification row.
// Track recently processed notification IDs in memory (auto-expires after 60s).
const recentIds = new Set<string>();

/**
 * Returns true if this ID was already seen within the last 60s (duplicate).
 * Returns false on first call (not a duplicate) and records the ID.
 */
export function isDuplicate(id: string): boolean {
  if (recentIds.has(id)) return true;
  recentIds.add(id);
  setTimeout(() => recentIds.delete(id), 60_000);
  return false;
}

/** Clear all entries — for testing only */
export function _resetDedup(): void {
  recentIds.clear();
}
