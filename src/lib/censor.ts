/**
 * Wingdings-flavor redaction for mystery checks.
 *
 * Why not the actual Wingdings font: not bundled on Android, inconsistent in
 * WKWebView, would silently fall back to ASCII and blow the redaction. Unicode
 * symbol scramble works everywhere and looks the same regardless of platform.
 *
 * Pool is curated for the cream/magenta zine vibe — stars, asterisks, sparkles,
 * blocks. Avoid emoji (renderer-dependent, looks wrong against mono text).
 */

const WINGDINGS_POOL = [
  "✦", "✧", "✪", "✰", "✩", "✫", "✬", "✭", "✮",
  "❀", "✿", "❉", "❊", "✤", "✣",
  "◈", "◉", "◇", "◆", "◊",
  "▓", "▒",
  "✱", "✲", "✳", "✴", "✵",
  "★", "☆",
];

/** Stable 32-bit hash of a string. djb2-ish, plenty for a deterministic-shuffle seed. */
function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Deterministic, fixed-length symbol scramble. Same `seed` always yields the
 * same string, so the redacted version of a given check stays stable across
 * re-renders / refreshes — important so the host doesn't visually "reveal"
 * by their redacted name suddenly changing.
 *
 * Length defaults to 6; intentionally NOT the real name length (that would
 * leak information).
 */
export function censorWingdings(seed: string, length = 6): string {
  const h = hashSeed(seed);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += WINGDINGS_POOL[(h + i * 2654435761) % WINGDINGS_POOL.length];
  }
  return out;
}

/** Single deterministic symbol — for avatar slots and other one-glyph spots. */
export function censorGlyph(seed: string): string {
  return WINGDINGS_POOL[hashSeed(seed) % WINGDINGS_POOL.length];
}

/**
 * Curated kaomoji pool for mystery-host avatars. Kept narrow-ish (4–6 visible
 * glyphs each) so they fit alongside regular letter circles without wrecking
 * the flex layout. Mix of moods — cheery, mischievous, sleepy, cat — so the
 * feed reads as a stack of different anonymous personalities, not all the
 * same redacted shrug.
 *
 * Avoid emoji (renderer-dependent), avoid combining marks with low Unicode
 * coverage, avoid anything that needs more than 1 line height.
 */
const KAOMOJI_POOL = [
  "(•‿•)",
  "(◕‿◕)",
  "(´◡`)",
  "(◔‿◔)",
  "(¬‿¬)",
  "(⌐■_■)",
  "(°o°)",
  "(⊙_⊙)",
  "(•_•)",
  "(˘ω˘)",
  "(◠‿◠)",
  "(◕ᴗ◕)",
  "(•ᴗ•)",
  "(=^･^=)",
  "(◡‿◡✿)",
  "(っ˘ω˘ς)",
  "(◍•ᴗ•◍)",
  "( ˙꒳​˙ )",
  "(︶ω︶)",
  "(¯ ͜ʖ ¯)",
];

/** Deterministic kaomoji for a given seed (e.g. check.id). */
export function censorKaomoji(seed: string): string {
  return KAOMOJI_POOL[hashSeed(seed) % KAOMOJI_POOL.length];
}

/**
 * Deterministic kaomoji per (thread, user) pair. Same user keeps the same
 * kaomoji throughout one thread (so you can follow a conversation), but gets
 * a different kaomoji in a different thread (so identity doesn't leak across
 * mystery checks).
 *
 * `threadSeed` is whatever scopes the conversation — `check.id` for comments,
 * `squad.id` for squad chat / member lists.
 */
export function kaomojiForUser(threadSeed: string, userId: string): string {
  return KAOMOJI_POOL[hashSeed(`${threadSeed}::${userId}`) % KAOMOJI_POOL.length];
}

/**
 * Assign a *unique* kaomoji to each user in a fixed-order roster, avoiding
 * the birthday-paradox collisions you'd hit calling `kaomojiForUser` per
 * user independently (with a 20-emoji pool, 3 users collide ~15% of the
 * time, 4 users ~25%). Each user's preferred kaomoji is computed first;
 * if it's already taken in the current set, we walk forward through the
 * pool until we find an unused one. The walk is deterministic given the
 * same `userIds` ordering, so re-renders are stable.
 *
 * If `userIds.length` exceeds `KAOMOJI_POOL.length` (20), later users
 * fall back to their unscoped preferred kaomoji and may duplicate — but
 * a 20+ person squad isn't the mystery use case we care about.
 */
export function kaomojiAssignmentForUsers(
  threadSeed: string,
  userIds: string[],
): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const uid of userIds) {
    const preferred = kaomojiForUser(threadSeed, uid);
    if (!used.has(preferred)) {
      used.add(preferred);
      out.set(uid, preferred);
      continue;
    }
    if (used.size >= KAOMOJI_POOL.length) {
      out.set(uid, preferred);
      continue;
    }
    const startIdx = KAOMOJI_POOL.indexOf(preferred);
    for (let step = 1; step < KAOMOJI_POOL.length; step++) {
      const candidate = KAOMOJI_POOL[(startIdx + step) % KAOMOJI_POOL.length];
      if (!used.has(candidate)) {
        used.add(candidate);
        out.set(uid, candidate);
        break;
      }
    }
  }
  return out;
}

/** Replace `@username` mentions in body text with `@???` for pre-reveal renders. */
export function stripAtMentions(text: string): string {
  return text.replace(/@\S+/g, "@???");
}
