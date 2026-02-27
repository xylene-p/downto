import { describe, it, expect, beforeEach } from "vitest";
import { dedup, _resetDedup } from "./dedup";

describe("dedup", () => {
  beforeEach(() => {
    _resetDedup();
  });

  it("first call returns false (not a duplicate)", () => {
    expect(dedup("notif-1")).toBe(false);
  });

  it("second call with same ID returns true (duplicate)", () => {
    dedup("notif-1");
    expect(dedup("notif-1")).toBe(true);
  });

  it("different IDs are independent", () => {
    expect(dedup("notif-1")).toBe(false);
    expect(dedup("notif-2")).toBe(false);
  });

  it("after TTL (60s), ID is no longer considered duplicate", () => {
    const t0 = 1000000;
    dedup("notif-1", t0);
    // 61 seconds later — should evict
    expect(dedup("notif-1", t0 + 61_000)).toBe(false);
  });

  it("within TTL, ID is still considered duplicate", () => {
    const t0 = 1000000;
    dedup("notif-1", t0);
    // 30 seconds later — still within TTL
    expect(dedup("notif-1", t0 + 30_000)).toBe(true);
  });
});
