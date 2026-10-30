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
    expect(state.status.value).toBe("phoneAway");

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
    expect(state.status.value).toBe("waitingForMessage");
  });

  it("waits for the phone without asking to scan once paired", async () => {
    const first = await loadContentScriptState();
    first.state.connectionDetails.value = CHANNEL;
    first.handlePhoneConnected();
    await flushStorageWrites();

    // After a reload, connected to the server but not yet to the phone
    const second = await loadContentScriptState();
    second.setWaitingForPhone();
    expect(second.state.status.value).toBe("phoneAway");
    expect(second.isConnectedToServer.value).toBe(true);
  });

  it("asks to scan the QR code when connected to the server but never paired", async () => {
    const { state, setWaitingForPhone } = await loadContentScriptState();
    state.connectionDetails.value = CHANNEL;
    setWaitingForPhone();
    expect(state.status.value).toBe("waitingForMessage");
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

describe("claimMessage", () => {
  beforeEach(() => {
    sessionStorage = {};
    vi.clearAllMocks();
  });

  const RESULT = { seq: 1, timestamp: "2026-10-26T18:00:00.000Z" };

  it("claims a call result only once", async () => {
    const { claimMessage, isMessageHandled } = await loadContentScriptState();
    expect(await isMessageHandled(RESULT)).toBe(false);
    expect(await claimMessage(RESULT)).toBe(true);
    expect(await isMessageHandled(RESULT)).toBe(true);
    expect(await claimMessage({ ...RESULT })).toBe(false);
  });

  it("remembers claimed results across page loads", async () => {
    const first = await loadContentScriptState();
    // Saved before it returns, since marking the result may navigate away
    expect(await first.claimMessage(RESULT)).toBe(true);

    // e.g. VAN loaded the next contact and the phone retried the result
    const second = await loadContentScriptState();
    expect(await second.isMessageHandled(RESULT)).toBe(true);
    expect(await second.claimMessage(RESULT)).toBe(false);
  });

  it("tells apart results from a reloaded phone page that reuse a seq", async () => {
    const { claimMessage } = await loadContentScriptState();
    expect(await claimMessage(RESULT)).toBe(true);
    expect(
      await claimMessage({ seq: 1, timestamp: "2026-10-26T18:05:00.000Z" }),
    ).toBe(true);
  });

  it("always claims results without an id (older connect pages)", async () => {
    const { claimMessage, isMessageHandled } = await loadContentScriptState();
    expect(await isMessageHandled({ seq: 1 })).toBe(false);
    expect(await claimMessage({ seq: 1 })).toBe(true);
    expect(await claimMessage({ seq: 1 })).toBe(true);
  });

  it("lets a released result be claimed again by the phone's retry", async () => {
    const first = await loadContentScriptState();
    expect(await first.claimMessage(RESULT)).toBe(true);
    // The result code wasn't on the page, so it wasn't marked
    await first.releaseMessage(RESULT);
    expect(await first.isMessageHandled(RESULT)).toBe(false);

    const second = await loadContentScriptState();
    expect(await second.claimMessage(RESULT)).toBe(true);
  });
});
