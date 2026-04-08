import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizePhone } from "../vpb-integrations/sanitize";

describe("sanitizeText", () => {
  it("returns normal text unchanged", () => {
    expect(sanitizeText("Alice Johnson")).toBe("Alice Johnson");
  });

  it("trims whitespace", () => {
    expect(sanitizeText("  Alice  ")).toBe("Alice");
  });

  it("truncates text exceeding the max length", () => {
    const longName = "A".repeat(200);
    expect(sanitizeText(longName)!.length).toBe(100);
  });

  it("returns undefined for undefined input", () => {
    expect(sanitizeText(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(sanitizeText("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(sanitizeText("   ")).toBeUndefined();
  });
});

describe("sanitizePhone", () => {
  it("returns normal phone numbers unchanged", () => {
    expect(sanitizePhone("(555) 123-4567")).toBe("(555) 123-4567");
  });

  it("truncates phone numbers exceeding max length", () => {
    const longPhone = "1".repeat(50);
    expect(sanitizePhone(longPhone)!.length).toBe(30);
  });

  it("returns undefined for undefined input", () => {
    expect(sanitizePhone(undefined)).toBeUndefined();
  });
});
