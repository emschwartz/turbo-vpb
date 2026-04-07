import { describe, it, expect } from "vitest";
import { normalizePhoneNumber } from "./phone";

describe("normalizePhoneNumber", () => {
  it("strips formatting and adds leading 1 for 10-digit numbers", () => {
    expect(normalizePhoneNumber("(555)-123-4567")).toBe("15551234567");
  });

  it("preserves 11-digit numbers with leading 1", () => {
    expect(normalizePhoneNumber("15551234567")).toBe("15551234567");
  });

  it("strips spaces, dashes, dots, and parens", () => {
    expect(normalizePhoneNumber("555 123 4567")).toBe("15551234567");
    expect(normalizePhoneNumber("555.123.4567")).toBe("15551234567");
  });

  it("handles already-normalized input", () => {
    expect(normalizePhoneNumber("15551234567")).toBe("15551234567");
  });

  it("handles +1 prefix", () => {
    expect(normalizePhoneNumber("+1 (555) 123-4567")).toBe("15551234567");
  });
});
