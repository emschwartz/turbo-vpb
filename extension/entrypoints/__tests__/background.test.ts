import { describe, it, expect, vi, beforeEach } from "vitest";

// Captured listener from browser.runtime.onMessage.addListener
let messageListener: (
  message: unknown,
  sender: { id?: string; url?: string; tab?: { id: number } },
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;

// Captured listener from browser.permissions.onAdded.addListener
let permissionsAddedListener: (changes: {
  origins?: string[];
}) => Promise<void>;

const EXTENSION_ID = "test-extension-id";

const mockBrowser = {
  runtime: {
    id: EXTENSION_ID,
    getManifest: () => ({
      content_scripts: [
        {
          matches: [
            "https://www.openvpb.com/VirtualPhoneBank*",
            "https://*/ContactDetailScript*",
          ],
          js: ["content-scripts/content.js"],
        },
        {
          matches: ["https://turbovpb.com/share*"],
          js: ["content-scripts/share-integration.js"],
        },
      ],
    }),
    onMessage: {
      addListener: vi.fn((listener: typeof messageListener) => {
        messageListener = listener;
      }),
    },
  },
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    local: {
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([{ result: false }]),
    insertCSS: vi.fn().mockResolvedValue(undefined),
  },
  permissions: {
    onAdded: {
      addListener: vi.fn((listener: typeof permissionsAddedListener) => {
        permissionsAddedListener = listener;
      }),
    },
    contains: vi.fn().mockResolvedValue(false),
  },
};

vi.mock("wxt/browser", () => ({
  browser: mockBrowser,
}));

// defineBackground is a WXT auto-import global. In the test environment,
// we need to provide it. It simply returns whatever is passed in.
vi.stubGlobal(
  "defineBackground",
  (definition: { main: () => void }) => definition,
);

describe("background message handler", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the background module and call main() to register listeners
    const mod = await import("../background");
    mod.default.main();
  });

  describe("sender validation", () => {
    it("rejects sessionStorage.get from external sender", () => {
      const sendResponse = vi.fn();
      const result = messageListener(
        { type: "sessionStorage.get", key: "someKey" },
        { id: "external-extension-id" },
        sendResponse,
      );

      expect(result).toBeUndefined();
      expect(mockBrowser.storage.session.get).not.toHaveBeenCalled();
    });

    it("rejects storage.local.set from external sender", () => {
      const sendResponse = vi.fn();
      const result = messageListener(
        { type: "storage.local.set", data: { key: "value" } },
        { id: "external-extension-id" },
        sendResponse,
      );

      expect(result).toBeUndefined();
      expect(mockBrowser.storage.local.set).not.toHaveBeenCalled();
    });

    it("rejects sessionStorage.set from external sender", () => {
      const sendResponse = vi.fn();
      const result = messageListener(
        { type: "sessionStorage.set", data: { key: "value" } },
        { id: "external-extension-id" },
        sendResponse,
      );

      expect(result).toBeUndefined();
      expect(mockBrowser.storage.session.set).not.toHaveBeenCalled();
    });

    it("rejects injectContentScript from external sender", () => {
      const sendResponse = vi.fn();
      const result = messageListener(
        { type: "injectContentScript" },
        { id: "external-extension-id" },
        sendResponse,
      );

      expect(result).toBeUndefined();
      expect(mockBrowser.tabs.query).not.toHaveBeenCalled();
    });

    it("rejects messages with no sender id", () => {
      const sendResponse = vi.fn();
      const result = messageListener(
        { type: "sessionStorage.get", key: "someKey" },
        {},
        sendResponse,
      );

      expect(result).toBeUndefined();
      expect(mockBrowser.storage.session.get).not.toHaveBeenCalled();
    });

    it("accepts sessionStorage.get from the extension itself", () => {
      const sendResponse = vi.fn();
      const result = messageListener(
        { type: "sessionStorage.get", key: "someKey" },
        { id: EXTENSION_ID },
        sendResponse,
      );

      expect(result).toBe(true);
      expect(mockBrowser.storage.session.get).toHaveBeenCalledWith("someKey");
    });

    it("accepts storage.local.set from the extension itself", () => {
      const sendResponse = vi.fn();
      const result = messageListener(
        { type: "storage.local.set", data: { key: "value" } },
        { id: EXTENSION_ID },
        sendResponse,
      );

      expect(result).toBe(true);
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        key: "value",
      });
    });

    it("accepts sessionStorage.set from the extension itself", () => {
      const sendResponse = vi.fn();
      const result = messageListener(
        { type: "sessionStorage.set", data: { key: "value" } },
        { id: EXTENSION_ID },
        sendResponse,
      );

      expect(result).toBe(true);
      expect(mockBrowser.storage.session.set).toHaveBeenCalledWith({
        key: "value",
      });
    });

    it("accepts injectContentScript from the extension itself", () => {
      const sendResponse = vi.fn();
      const result = messageListener(
        { type: "injectContentScript" },
        { id: EXTENSION_ID },
        sendResponse,
      );

      expect(result).toBe(true);
      expect(mockBrowser.tabs.query).toHaveBeenCalled();
    });
  });

  // The content script's session is scoped to the page's origin, so a page
  // on another site that also runs the content script (the script matches
  // every https://*/ContactDetailScript URL) can't resume a phone bank's
  // session. See TabSessionStorage.
  describe("session scoping", () => {
    const VAN = "https://www.votebuilder.com/ContactDetailScript?x=1";
    const OTHER = "https://evil.example/ContactDetailScript";

    function sessionGet(key: string, url: string, tabId: number) {
      return new Promise<Record<string, unknown>>((resolve) => {
        messageListener(
          { type: "sessionStorage.get", key },
          { id: EXTENSION_ID, url, tab: { id: tabId } },
          resolve as (response?: unknown) => void,
        );
      });
    }
    function sessionSet(
      data: Record<string, unknown>,
      url: string,
      tabId: number,
    ) {
      return new Promise<unknown>((resolve) => {
        messageListener(
          { type: "sessionStorage.set", data },
          { id: EXTENSION_ID, url, tab: { id: tabId } },
          resolve,
        );
      });
    }

    beforeEach(() => {
      // A real in-memory storage.session
      const items: Record<string, unknown> = {};
      mockBrowser.storage.session.get.mockImplementation(
        async (keys: string[] | string | null) => {
          if (keys === null) return { ...items };
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            list.filter((k) => k in items).map((k) => [k, items[k]]),
          );
        },
      );
      mockBrowser.storage.session.set.mockImplementation(
        async (data: Record<string, unknown>) => {
          Object.assign(items, data);
        },
      );
      (mockBrowser.storage.session as any).remove = vi.fn(
        async (keys: string[]) => {
          for (const key of keys) delete items[key];
        },
      );
      (mockBrowser.tabs as any).get = vi.fn(async (tabId: number) => {
        if (tabId === 1) throw new Error("No tab with id: 1");
        return { id: tabId };
      });
    });

    it("does not hand a closed phone bank tab's session to another site", async () => {
      await sessionSet({ turboVpbConnection: { channelId: "c" } }, VAN, 1);
      // Tab 1 is closed (tabs.get throws for it); tab 2 is on another site
      expect(await sessionGet("turboVpbConnection", OTHER, 2)).toEqual({});
      // but a new tab on the phone bank site resumes it
      expect(await sessionGet("turboVpbConnection", VAN, 3)).toEqual({
        turboVpbConnection: { channelId: "c" },
      });
    });

    it("does not carry a session along when the tab moves to another site", async () => {
      await sessionSet({ turboVpbConnection: { channelId: "c" } }, VAN, 2);
      expect(await sessionGet("turboVpbConnection", OTHER, 2)).toEqual({});
    });
  });

  // When a site is enabled at runtime, the content script is only injected
  // into pages it is declared for in the manifest. Host permissions are not
  // that check: Chrome ignores the path of a host permission, so the
  // https://*/ContactDetailScript one covers every https origin.
  describe("programmatic injection", () => {
    function injectedTabIds(): number[] {
      return mockBrowser.scripting.executeScript.mock.calls
        .filter((call) => (call[0] as any).files)
        .map((call) => (call[0] as any).target.tabId);
    }

    it("injects only into pages the content script is declared for", async () => {
      mockBrowser.permissions.contains.mockResolvedValue(true);
      mockBrowser.tabs.query.mockResolvedValue([
        { id: 1, url: "https://van.example.org/ContactDetailScript?a=1" },
        { id: 2, url: "https://mail.example.com/inbox" },
        { id: 3, url: "https://van.example.org/" },
        { id: 4, url: "https://www.openvpb.com/VirtualPhoneBank/123" },
        { id: 5, url: "https://turbovpb.com/share?x" },
        { id: 6 },
      ]);

      await permissionsAddedListener({
        origins: ["https://van.example.org/*"],
      });

      expect(injectedTabIds()).toEqual([1, 4]);
    });

    it("skips a page the content script is already in", async () => {
      mockBrowser.permissions.contains.mockResolvedValue(true);
      mockBrowser.scripting.executeScript.mockResolvedValueOnce([
        { result: true },
      ]);
      mockBrowser.tabs.query.mockResolvedValue([
        { id: 1, url: "https://van.example.org/ContactDetailScript" },
      ]);

      await permissionsAddedListener({
        origins: ["https://van.example.org/*"],
      });

      expect(injectedTabIds()).toEqual([]);
    });
  });
});
