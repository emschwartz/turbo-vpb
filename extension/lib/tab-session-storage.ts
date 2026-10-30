/**
 * storage.session, kept separately for each tab and site.
 *
 * The content script's session (channel, pairing, call results already
 * marked) lives in storage.session so that it survives page loads: VAN loads
 * every contact with a full navigation. But storage.session is shared by
 * the whole browser session, so two phone bank tabs would share one
 * channel: both would send their contact to the phone, and both would get
 * every call result.
 *
 * So each tab gets its own namespace. A tab that was closed leaves its
 * session behind, and the next new tab on the same site that asks for
 * session data adopts it, so reopening the phone bank tab resumes the
 * phone's session instead of needing a new QR code scan.
 *
 * A session never crosses sites. The content script runs on every https
 * page whose path is /ContactDetailScript (VAN uses custom domains), so a
 * page anyone can host runs it too. If that page could resume the
 * volunteer's session, it would be paired with their phone: it could feed the
 * phone a contact of its choosing, and it could read the channel key from the
 * page and listen in on the phone's messages. So a session belongs to the
 * origin that created it: a tab that navigates to a different site starts
 * over, and a closed tab's session is only resumed on the same site.
 */

export interface SessionStore {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

const PREFIX = "tab";
const UPDATED_AT_KEY = "updatedAt";
const ORIGIN_KEY = "origin";

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
  // Tab+origin pairs whose namespace has been set up (or adopted) since the
  // background script started. The service worker can be restarted at any
  // time, so this is only a shortcut: storage is the source of truth.
  private readyTabs = new Map<string, Promise<void>>();

  constructor(
    private store: SessionStore,
    private tabExists: (tabId: number) => Promise<boolean>,
  ) {}

  /**
   * @param origin - The origin of the page asking, which the session is
   * scoped to. Pages on a different origin never see each other's session.
   */
  async get(
    tabId: number,
    origin: string,
    key: string,
  ): Promise<Record<string, unknown>> {
    await this.ready(tabId, origin);
    const storageKey = namespaced(tabId, key);
    const result = await this.store.get([storageKey]);
    return storageKey in result ? { [key]: result[storageKey] } : {};
  }

  async set(
    tabId: number,
    origin: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.ready(tabId, origin);
    const items: Record<string, unknown> = {
      [namespaced(tabId, UPDATED_AT_KEY)]: Date.now(),
      [namespaced(tabId, ORIGIN_KEY)]: origin,
    };
    for (const [key, value] of Object.entries(data)) {
      if (key === ORIGIN_KEY) {
        continue;
      }
      items[namespaced(tabId, key)] = value;
    }
    await this.store.set(items);
  }

  private ready(tabId: number, origin: string): Promise<void> {
    const cacheKey = `${tabId}|${origin}`;
    let ready = this.readyTabs.get(cacheKey);
    if (!ready) {
      ready = this.prepareNamespace(tabId, origin).catch((err) => {
        console.error("Error preparing a tab's session:", err);
      });
      this.readyTabs.set(cacheKey, ready);
    }
    return ready;
  }

  // Drop the tab's session if it was created on another site, then, if the
  // tab has no session, take over the most recently used session that a
  // closed tab left behind on this site.
  private async prepareNamespace(tabId: number, origin: string): Promise<void> {
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

    const own = byTab.get(tabId);
    if (own) {
      if (own[ORIGIN_KEY] === origin) {
        return;
      }
      // The tab navigated to a different site (or the session predates
      // origin scoping): it starts over rather than carrying the other
      // site's pairing along
      console.log(`Tab ${tabId} moved to ${origin}, dropping its session`);
      await this.store.remove(
        Object.keys(own).map((key) => namespaced(tabId, key)),
      );
      byTab.delete(tabId);
    }

    let orphan: { tabId: number; entries: Record<string, unknown> } | undefined;
    for (const [otherTabId, entries] of byTab) {
      if (entries[ORIGIN_KEY] !== origin) {
        continue;
      }
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
