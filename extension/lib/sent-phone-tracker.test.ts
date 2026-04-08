import { describe, it, expect } from "vitest";
import { SentPhoneTracker } from "./sent-phone-tracker";

describe("SentPhoneTracker", () => {
  it("tracks sent phone numbers", () => {
    const tracker = new SentPhoneTracker(100);
    tracker.add("15551234567");
    expect(tracker.has("15551234567")).toBe(true);
    expect(tracker.has("15559999999")).toBe(false);
  });

  it("evicts oldest entries when capacity is exceeded", () => {
    const tracker = new SentPhoneTracker(3);
    tracker.add("1111");
    tracker.add("2222");
    tracker.add("3333");
    expect(tracker.has("1111")).toBe(true);

    tracker.add("4444");
    expect(tracker.has("1111")).toBe(false);
    expect(tracker.has("2222")).toBe(true);
    expect(tracker.has("4444")).toBe(true);
  });

  it("does not double-count when adding the same number twice", () => {
    const tracker = new SentPhoneTracker(2);
    tracker.add("1111");
    tracker.add("1111");
    tracker.add("2222");
    expect(tracker.has("1111")).toBe(true);
    expect(tracker.has("2222")).toBe(true);
  });
});
