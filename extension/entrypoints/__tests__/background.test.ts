import { describe, it, expect, vi, beforeEach } from "vitest";

// Captured listener from browser.runtime.onMessage.addListener
let messageListener: (
  message: unknown,
  sender: { id?: string },
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;

const EXTENSION_ID = "test-extension-id";

const mockBrowser = {
  runtime: {
    id: EXTENSION_ID,
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
      addListener: vi.fn(),
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
});
