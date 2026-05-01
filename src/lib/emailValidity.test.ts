import { describe, it, expect } from "vitest";
import { isValidEmailShape, suggestEmailFix } from "./emailValidity";

describe("isValidEmailShape", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmailShape("a@b.co")).toBe(true);
    expect(isValidEmailShape("perezkh@gmail.com")).toBe(true);
    expect(isValidEmailShape("first.last+tag@sub.example.org")).toBe(true);
  });

  it("rejects the prod typo cases that produced dead accounts", () => {
    // missing TLD — old `.includes("@")` accepted these
    expect(isValidEmailShape("sarah.an.ferguson@gmail")).toBe(false);
    expect(isValidEmailShape("anyone@gmail")).toBe(false);
    // single-letter TLD
    expect(isValidEmailShape("user@gmail.c")).toBe(false);
  });

  it("rejects shapes that aren't emails at all", () => {
    expect(isValidEmailShape("")).toBe(false);
    expect(isValidEmailShape("@")).toBe(false);
    expect(isValidEmailShape("noatsign.com")).toBe(false);
    expect(isValidEmailShape("user@")).toBe(false);
    expect(isValidEmailShape("@example.com")).toBe(false);
    expect(isValidEmailShape("with space@ex.com")).toBe(false);
  });

  it("trims surrounding whitespace before checking", () => {
    expect(isValidEmailShape("  a@b.co  ")).toBe(true);
  });
});

describe("suggestEmailFix", () => {
  it("flags the prod typo cases with the right correction", () => {
    expect(suggestEmailFix("perezkh@gmail.con")).toBe("perezkh@gmail.com");
    expect(suggestEmailFix("perezkh@gnail.com")).toBe("perezkh@gmail.com");
  });

  it("preserves the local-part casing while normalising the domain", () => {
    expect(suggestEmailFix("Mixed.Case@Gmail.Con")).toBe("Mixed.Case@gmail.com");
  });

  it("catches common provider typos", () => {
    expect(suggestEmailFix("u@gmial.com")).toBe("u@gmail.com");
    expect(suggestEmailFix("u@hotmial.com")).toBe("u@hotmail.com");
    expect(suggestEmailFix("u@yaho.com")).toBe("u@yahoo.com");
    expect(suggestEmailFix("u@iclou.com")).toBe("u@icloud.com");
  });

  it("returns null for valid emails and unknown domains", () => {
    expect(suggestEmailFix("u@gmail.com")).toBeNull();
    expect(suggestEmailFix("u@example.org")).toBeNull();
    expect(suggestEmailFix("u@")).toBeNull();
    expect(suggestEmailFix("no-at-sign")).toBeNull();
    expect(suggestEmailFix("")).toBeNull();
  });
});
