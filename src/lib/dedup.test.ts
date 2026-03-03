import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { isDuplicate, _resetDedup } from "./dedup";

describe("isDuplicate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetDedup();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first call returns false (not a duplicate)", () => {
    expect(isDuplicate("notif-1")).toBe(false);
  });

  it("second call with same ID returns true (duplicate)", () => {
    isDuplicate("notif-1");
    expect(isDuplicate("notif-1")).toBe(true);
  });

  it("different IDs are independent", () => {
    expect(isDuplicate("notif-1")).toBe(false);
    expect(isDuplicate("notif-2")).toBe(false);
  });

  it("after TTL (60s), ID is no longer considered duplicate", () => {
    isDuplicate("notif-1");
    vi.advanceTimersByTime(61_000);
    expect(isDuplicate("notif-1")).toBe(false);
  });

  it("within TTL, ID is still considered duplicate", () => {
    isDuplicate("notif-1");
    vi.advanceTimersByTime(30_000);
    expect(isDuplicate("notif-1")).toBe(true);
  });
});
