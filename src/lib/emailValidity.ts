/**
 * Tiny pre-flight email validity helpers for the auth flow.
 *
 * Real email validation is unsolvable client-side — RFC 5321 allows things
 * that no SMTP server will deliver to, and the only definitive answer is
 * "did the OTP arrive?" But we can still catch the cases that produced
 * dead-account orphans in our prod data:
 *
 *   - perezkh@gmail.con      (TLD typo)
 *   - perezkh@gnail.com      (domain typo)
 *   - sarah.an.ferguson@gmail (missing TLD)
 *
 * `isValidEmailShape` enforces the structural floor: local-part `@`
 * domain `.` TLD-of-2+-chars. Stricter than the previous `.includes("@")`
 * but deliberately not RFC-compliant — we want false positives, not false
 * negatives.
 *
 * `suggestEmailFix` does fuzzy detection for the common typos and returns
 * a corrected version (or null when nothing obvious is wrong). The auth
 * screen surfaces it as "did you mean X?" — non-blocking; the user can
 * tap to fix or proceed anyway.
 */

const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  // Gmail
  "gmial.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cim": "gmail.com",
  // Hotmail / Outlook
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloook.com": "outlook.com",
  // Yahoo
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  // iCloud
  "iclou.com": "icloud.com",
  "icloud.co": "icloud.com",
  "icloud.con": "icloud.com",
};

/** Local-part `@` domain `.` TLD of at least 2 letters. Permissive — catches
 *  the structural failures (no `@`, missing TLD) without trying to be RFC. */
const SHAPE_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function isValidEmailShape(email: string): boolean {
  return SHAPE_RE.test(email.trim());
}

/** Returns a corrected email (e.g. `gmail.com` for `gnail.com`) or null
 *  when nothing obvious is wrong. Domain match is case-insensitive. */
export function suggestEmailFix(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  const fix = COMMON_DOMAIN_TYPOS[domain];
  return fix ? `${local}@${fix}` : null;
}
