import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./crypto", () => ({
  generateKey: vi.fn(),
  randomId: () => "channel",
  encrypt: vi.fn(async (_key: unknown, message: any) =>
    new TextEncoder().encode(JSON.stringify(message)),
  ),
  decrypt: vi.fn(),
  exportKey: vi.fn(),
}));

import PubSubClient from "./pubsub-client";

// Records the order the server receives messages in, and lets the test
// decide when each request completes
function fakeServer() {
  const received: string[] = [];
  const pending: Array<() => void> = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    received.push(
      JSON.parse(new TextDecoder().decode(init.body as Uint8Array)).type,
    );
    await new Promise<void>((resolve) => pending.push(resolve));
    return { ok: true } as Response;
  });
  return {
    received,
    fetch,
    completeNext: () => pending.shift()!(),
  };
}

describe("PubSubClient.send", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers messages to the server in the order they were sent", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.fetch);
    const client = new PubSubClient(
      "http://server",
      "channel",
      {} as CryptoKey,
    );

    // e.g. the previous contact with updated stats, then the next contact
    const first = client.send({ type: "previous" });
    const second = client.send({ type: "next" });
    await vi.waitFor(() => expect(server.received).toEqual(["previous"]));

    // The second request isn't made until the first has completed, so the
    // server can't receive them out of order
    server.completeNext();
    expect(await first).toBe(true);
    await vi.waitFor(() =>
      expect(server.received).toEqual(["previous", "next"]),
    );
    server.completeNext();
    expect(await second).toBe(true);
  });

  it("keeps sending after a failed send", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce({ ok: true }),
    );
    const client = new PubSubClient(
      "http://server",
      "channel",
      {} as CryptoKey,
    );
    expect(await client.send({ type: "a" })).toBe(false);
    expect(await client.send({ type: "b" })).toBe(true);
  });
});
