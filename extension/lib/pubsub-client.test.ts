import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./crypto", () => ({
  generateKey: vi.fn(),
  randomId: () => "channel",
  encrypt: vi.fn(async (_key: unknown, message: any) =>
    new TextEncoder().encode(JSON.stringify(message)),
  ),
  decrypt: vi.fn(),
  decryptFrom: vi.fn(),
  exportKey: vi.fn(),
}));

// A socket the test drives: it opens right away, and the test delivers
// messages to it
vi.mock("reconnecting-websocket", () => {
  class FakeSocket {
    static last: FakeSocket;
    binaryType = "";
    private listeners: Record<string, Array<(event: any) => void>> = {};
    constructor() {
      FakeSocket.last = this;
      setTimeout(() => this.emit("open", {}), 0);
    }
    addEventListener(type: string, listener: (event: any) => void) {
      (this.listeners[type] ??= []).push(listener);
    }
    removeEventListener(type: string, listener: (event: any) => void) {
      this.listeners[type] = (this.listeners[type] ?? []).filter(
        (l) => l !== listener,
      );
    }
    emit(type: string, event: any) {
      for (const listener of [...(this.listeners[type] ?? [])]) {
        listener(event);
      }
    }
    close() {}
  }
  return { default: FakeSocket };
});

import ReconnectingWebSocket from "reconnecting-websocket";
import { encrypt, decryptFrom } from "./crypto";
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

describe("PubSubClient sender binding", () => {
  const socket = () => (ReconnectingWebSocket as any).last;

  beforeEach(() => {
    vi.mocked(encrypt).mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }) as Response),
    );
  });

  async function connectedClient({ selfHosted = true } = {}) {
    const client = new PubSubClient(
      "http://server",
      "channel",
      {} as CryptoKey,
      // A self-hosted server may still serve an old connect page
      { allowUnboundSending: selfHosted },
    );
    await client.connect();
    return client;
  }

  // Delivers a message from the phone that decrypts as bound or unbound
  async function receive(client: PubSubClient, bound: boolean) {
    const received = new Promise<void>((resolve) => {
      client.onmessage = () => resolve();
    });
    vi.mocked(decryptFrom).mockResolvedValueOnce({
      message: { type: "ack" },
      bound,
    });
    socket().emit("message", { data: new Blob([new Uint8Array([1])]) });
    await received;
  }

  // The sender the last sent message was bound to (undefined: unbound)
  async function sentAs(client: PubSubClient) {
    await client.send({ type: "connect" });
    return vi.mocked(encrypt).mock.lastCall![2];
  }

  it("binds messages to the extension while the phone sends bound messages", async () => {
    const client = await connectedClient();
    expect(await sentAs(client)).toBe("extension");
    await receive(client, true);
    await receive(client, true);
    expect(await sentAs(client)).toBe("extension");
  });

  it("sends unbound messages once the phone sends one (an old connect page)", async () => {
    const client = await connectedClient();
    await receive(client, false);
    expect(await sentAs(client)).toBeUndefined();
    await receive(client, false);
    expect(await sentAs(client)).toBeUndefined();
  });

  // A bound message proves a current connect page holding the key, so
  // switching back restores protection against reflection, and an old
  // connect page never sends one
  it("binds messages again once the phone sends a bound one", async () => {
    const client = await connectedClient();
    await receive(client, false);
    await receive(client, true);
    expect(await sentAs(client)).toBe("extension");
  });

  // The default server always serves a current connect page, so an unbound
  // message there can only be a replay of one an old page sent earlier, and
  // must not make this side reflectable
  it("never sends unbound messages to the default server", async () => {
    const client = await connectedClient({ selfHosted: false });
    await receive(client, false);
    expect(await sentAs(client)).toBe("extension");
  });

  it("starts out bound on each connection", async () => {
    const client = await connectedClient();
    await receive(client, false);
    await client.connect();
    expect(await sentAs(client)).toBe("extension");
  });
});
