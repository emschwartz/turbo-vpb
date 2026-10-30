import { describe, it, expect } from "vitest";
import { TabSessionStorage, SessionStore } from "./tab-session-storage";

function fakeStore(): SessionStore & { items: Record<string, unknown> } {
  const items: Record<string, unknown> = {};
  return {
    items,
    async get(keys) {
      if (keys === null) {
        return { ...items };
      }
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in items) {
          result[key] = items[key];
        }
      }
      return result;
    },
    async set(data) {
      Object.assign(items, data);
    },
    async remove(keys) {
      for (const key of keys) {
        delete items[key];
      }
    },
  };
}

function setup(openTabs: number[]) {
  const tabs = new Set(openTabs);
  const store = fakeStore();
  const storage = new TabSessionStorage(store, async (tabId) =>
    tabs.has(tabId),
  );
  return { tabs, store, storage };
}

const CHANNEL_A = { channelId: "a", encryptionKey: "ka", sessionId: "sa" };
const CHANNEL_B = { channelId: "b", encryptionKey: "kb", sessionId: "sb" };

describe("TabSessionStorage", () => {
  it("keeps each tab's session separate", async () => {
    const { storage } = setup([1, 2]);
    await storage.set(1, { connection: CHANNEL_A });

    // A second phone bank tab doesn't share the first one's phone
    expect(await storage.get(2, "connection")).toEqual({});
    await storage.set(2, { connection: CHANNEL_B });
    expect(await storage.get(1, "connection")).toEqual({
      connection: CHANNEL_A,
    });
    expect(await storage.get(2, "connection")).toEqual({
      connection: CHANNEL_B,
    });
  });

  it("keeps a tab's session across page loads", async () => {
    const { storage } = setup([1]);
    await storage.set(1, { connection: CHANNEL_A, paired: "a" });

    // e.g. VAN loading the next contact, with the background script
    // restarted in between
    const { store } = { store: (storage as any).store };
    const reloaded = new TabSessionStorage(store, async () => true);
    expect(await reloaded.get(1, "connection")).toEqual({
      connection: CHANNEL_A,
    });
    expect(await reloaded.get(1, "paired")).toEqual({ paired: "a" });
  });

  it("resumes a closed tab's session in the next new tab", async () => {
    const { tabs, storage } = setup([1]);
    await storage.set(1, { connection: CHANNEL_A, paired: "a" });

    // The volunteer closes the phone bank tab and opens a new one
    tabs.delete(1);
    tabs.add(2);
    expect(await storage.get(2, "connection")).toEqual({
      connection: CHANNEL_A,
    });
    expect(await storage.get(2, "paired")).toEqual({ paired: "a" });

    // Only once: a third tab doesn't get it too
    tabs.add(3);
    expect(await storage.get(3, "connection")).toEqual({});
  });

  it("does not take the session of a tab that is still open", async () => {
    const { tabs, storage } = setup([1]);
    await storage.set(1, { connection: CHANNEL_A });

    tabs.add(2);
    expect(await storage.get(2, "connection")).toEqual({});
  });

  it("resumes the most recently used closed tab's session", async () => {
    const { tabs, store, storage } = setup([1, 2]);
    await storage.set(1, { connection: CHANNEL_A });
    await storage.set(2, { connection: CHANNEL_B });
    store.items["tab:1:updatedAt"] = 1000;
    store.items["tab:2:updatedAt"] = 2000;

    tabs.delete(1);
    tabs.delete(2);
    tabs.add(3);
    expect(await storage.get(3, "connection")).toEqual({
      connection: CHANNEL_B,
    });
  });

  it("adopts once when a new tab reads several keys at the same time", async () => {
    const { tabs, storage } = setup([1]);
    await storage.set(1, { connection: CHANNEL_A, paired: "a", stats: 5 });
    tabs.delete(1);
    tabs.add(2);

    // The content script loads all of its stored signals in parallel
    const [connection, paired, stats] = await Promise.all([
      storage.get(2, "connection"),
      storage.get(2, "paired"),
      storage.get(2, "stats"),
    ]);
    expect(connection).toEqual({ connection: CHANNEL_A });
    expect(paired).toEqual({ paired: "a" });
    expect(stats).toEqual({ stats: 5 });
  });

  it("does not adopt into a tab that already has a session", async () => {
    const { tabs, storage } = setup([1, 2]);
    await storage.set(1, { connection: CHANNEL_A });
    await storage.set(2, { connection: CHANNEL_B });
    tabs.delete(1);

    // Tab 2 reloads with the background script restarted
    const reloaded = new TabSessionStorage(
      (storage as any).store,
      async (tabId) => tabs.has(tabId),
    );
    expect(await reloaded.get(2, "connection")).toEqual({
      connection: CHANNEL_B,
    });
  });
});
