/**
 * storage.session, kept separately for each tab.
 *
 * The content script's session (channel, pairing, call results already
 * marked) lives in storage.session so that it survives page loads: VAN loads
 * every contact with a full navigation. But storage.session is shared by
 * the whole browser session, so two phone bank tabs would share one
 * channel: both would send their contact to the phone, and both would get
 * every call result.
 *
 * So each tab gets its own namespace. A tab that was closed leaves its
 * session behind, and the next new tab that asks for session data adopts
 * it, so reopening the phone bank tab resumes the phone's session instead
 * of needing a new QR code scan.
 */

export interface SessionStore {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

const PREFIX = "tab";
const UPDATED_AT_KEY = "updatedAt";

function namespaced(tabId: number, key: string): string {
  return `${PREFIX}:${tabId}:${key}`;
}

function parse(storageKey: string): { tabId: number; key: string } | undefined {
  const match = /^tab:(\d+):(.+)$/.exec(storageKey);
  if (!match) {
    return;
  }
  return { tabId: Number(match[1]), key: match[2] };
}

export class TabSessionStorage {
  // Tabs whose namespace has been set up (or adopted) since the background
  // script started. The service worker can be restarted at any time, so
  // this is only a shortcut: storage is the source of truth.
  private readyTabs = new Map<number, Promise<void>>();

  constructor(
    private store: SessionStore,
    private tabExists: (tabId: number) => Promise<boolean>,
  ) {}

  async get(tabId: number, key: string): Promise<Record<string, unknown>> {
    await this.ready(tabId);
    const storageKey = namespaced(tabId, key);
    const result = await this.store.get([storageKey]);
    return storageKey in result ? { [key]: result[storageKey] } : {};
  }

  async set(tabId: number, data: Record<string, unknown>): Promise<void> {
    await this.ready(tabId);
    const items: Record<string, unknown> = {
      [namespaced(tabId, UPDATED_AT_KEY)]: Date.now(),
    };
    for (const [key, value] of Object.entries(data)) {
      items[namespaced(tabId, key)] = value;
    }
    await this.store.set(items);
  }

  private ready(tabId: number): Promise<void> {
    let ready = this.readyTabs.get(tabId);
    if (!ready) {
      ready = this.adoptOrphanedSession(tabId).catch((err) => {
        console.error("Error adopting a closed tab's session:", err);
      });
      this.readyTabs.set(tabId, ready);
    }
    return ready;
  }

  // If this tab has no session yet, take over the most recently used
  // session of a tab that no longer exists.
  private async adoptOrphanedSession(tabId: number): Promise<void> {
    const all = await this.store.get(null);
    const byTab = new Map<number, Record<string, unknown>>();
    for (const [storageKey, value] of Object.entries(all)) {
      const parsed = parse(storageKey);
      if (!parsed) {
        continue;
      }
      const entries = byTab.get(parsed.tabId) ?? {};
      entries[parsed.key] = value;
      byTab.set(parsed.tabId, entries);
    }
    if (byTab.has(tabId)) {
      return;
    }

    let orphan: { tabId: number; entries: Record<string, unknown> } | undefined;
    for (const [otherTabId, entries] of byTab) {
      if (await this.tabExists(otherTabId)) {
        continue;
      }
      if (
        !orphan ||
        Number(entries[UPDATED_AT_KEY] ?? 0) >
          Number(orphan.entries[UPDATED_AT_KEY] ?? 0)
      ) {
        orphan = { tabId: otherTabId, entries };
      }
    }
    if (!orphan) {
      return;
    }

    console.log(
      `Tab ${tabId} resumes the session of closed tab ${orphan.tabId}`,
    );
    const items: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(orphan.entries)) {
      items[namespaced(tabId, key)] = value;
    }
    await this.store.set(items);
    await this.store.remove(
      Object.keys(orphan.entries).map((key) => namespaced(orphan.tabId, key)),
    );
  }
}
