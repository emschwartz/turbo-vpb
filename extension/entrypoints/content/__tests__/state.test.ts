import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake storage.session, shared across "page loads" (module re-imports)
// the same way the real one is shared across content script reloads.
let sessionStorage: Record<string, unknown> = {};

const mockBrowser = {
  runtime: {
    getManifest: () => ({ version: "0.0.0-test" }),
    sendMessage: vi.fn(async (message: any) => {
      if (message.type === "sessionStorage.get") {
        return { [message.key]: sessionStorage[message.key] };
      }
      if (message.type === "sessionStorage.set") {
        Object.assign(sessionStorage, message.data);
        return true;
      }
    }),
  },
};

vi.mock("wxt/browser", () => ({
  browser: mockBrowser,
}));

const CHANNEL = {
  encryptionKey: "key",
  sessionId: "session",
  channelId: "channel-1",
};

// Simulate a fresh content script load (e.g. a page reload) and wait for
// stored state to load, mirroring the startup sequence in index.tsx.
async function loadContentScriptState() {
  vi.resetModules();
  const mod = await import("../state");
  await Promise.all([
    mod.state.connectionDetails.loaded,
    mod.state.pairedChannelId.loaded,
  ]);
  mod.autoShowQrCodeModal();
  return mod;
}

// Stored-signal writes go through async message passing
async function flushStorageWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("QR code modal", () => {
  beforeEach(() => {
    sessionStorage = {};
    vi.clearAllMocks();
  });

  it("is shown on first load before any phone has paired", async () => {
    const { state } = await loadContentScriptState();
    expect(state.showQrCodeModal.value).toBe(true);
  });

  it("is shown on load when the stored channel was never paired", async () => {
    sessionStorage.turboVpbConnection = CHANNEL;
    const { state } = await loadContentScriptState();
    expect(state.showQrCodeModal.value).toBe(true);
  });

  it("is hidden and marks the channel paired when the phone connects", async () => {
    const { state, handlePhoneConnected, isPaired } =
      await loadContentScriptState();
    state.connectionDetails.value = CHANNEL;

    handlePhoneConnected();

    expect(state.showQrCodeModal.value).toBe(false);
    expect(state.status.value).toBe("connected");
    expect(isPaired.value).toBe(true);
  });

  it("stays hidden when a paired phone temporarily disconnects", async () => {
    const { state, handlePhoneConnected, handlePhoneDisconnected } =
      await loadContentScriptState();
    state.connectionDetails.value = CHANNEL;
    handlePhoneConnected();

    // Volunteer taps "Call": the phone's browser goes to the background
    handlePhoneDisconnected();

    expect(state.showQrCodeModal.value).toBe(false);
    expect(state.status.value).toBe("waitingForMessage");

    // Volunteer switches back to the browser and it reconnects
    handlePhoneConnected();
    expect(state.showQrCodeModal.value).toBe(false);
    expect(state.status.value).toBe("connected");
  });

  it("stays hidden across many calls", async () => {
    const { state, handlePhoneConnected, handlePhoneDisconnected } =
      await loadContentScriptState();
    state.connectionDetails.value = CHANNEL;
    handlePhoneConnected();

    for (let i = 0; i < 10; i++) {
      handlePhoneDisconnected();
      expect(state.showQrCodeModal.value).toBe(false);
      handlePhoneConnected();
    }
  });

  it("is shown on disconnect if the phone never paired", async () => {
    const { state, hideQrCodeModal, handlePhoneDisconnected } =
      await loadContentScriptState();
    state.connectionDetails.value = CHANNEL;
    hideQrCodeModal();

    handlePhoneDisconnected();

    expect(state.showQrCodeModal.value).toBe(true);
  });

  it("is not shown after a page reload once the channel is paired", async () => {
    const first = await loadContentScriptState();
    first.state.connectionDetails.value = CHANNEL;
    first.handlePhoneConnected();
    await flushStorageWrites();

    // VAN loads the next contact with a full page navigation, while the
    // phone is still in the dialer and can't reply yet
    const second = await loadContentScriptState();

    expect(second.state.connectionDetails.value).toEqual(CHANNEL);
    expect(second.isPaired.value).toBe(true);
    expect(second.state.showQrCodeModal.value).toBe(false);
  });

  it("is shown after a reload if the channel changed since pairing", async () => {
    sessionStorage.turboVpbConnection = CHANNEL;
    sessionStorage.turboVpbPairedChannel = "some-other-channel";

    const { state, isPaired } = await loadContentScriptState();

    expect(isPaired.value).toBe(false);
    expect(state.showQrCodeModal.value).toBe(true);
  });

  it("can still be opened manually when paired", async () => {
    const { state, handlePhoneConnected, showQrCodeModal } =
      await loadContentScriptState();
    state.connectionDetails.value = CHANNEL;
    handlePhoneConnected();

    showQrCodeModal();

    expect(state.showQrCodeModal.value).toBe(true);
  });
});
