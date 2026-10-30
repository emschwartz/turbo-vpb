import { signal, computed, batch } from "@preact/signals";
import PubSubClient from "../../lib/pubsub-client";
import { sessionStoredSignal } from "../../lib/stored-signal";
import {
  ConnectionDetails,
  ConnectionStatus,
  ContactDetails,
  DailyCallHistory,
  ExtensionSettings,
  ScrapeConfidence,
  Stats,
} from "../../lib/types";
import { browser } from "wxt/browser";
import { randomId } from "../../lib/crypto";
import { isAllowedServerUrl } from "../../lib/server-url";

const DEFAULT_SERVER_URL = import.meta.env.DEV
  ? "http://localhost:8080"
  : "https://turbovpb.com";

export const state = {
  settings: signal(undefined as ExtensionSettings | undefined),
  pubsubClient: signal(undefined as PubSubClient | undefined),
  status: signal("connectingToServer" as ConnectionStatus),
  connectionDetails: sessionStoredSignal<ConnectionDetails | undefined>(
    "turboVpbConnection",
    undefined,
  ),
  sessionStats: sessionStoredSignal<Stats>("turboVpbStats", {
    calls: 0,
    successfulCalls: 0,
    startTime: Date.now(),
  }),
  totalCalls: signal(0),
  dailyCalls: signal([] as DailyCallHistory),
  // The channel the phone last paired with in this browser session.
  // Persisted so that page reloads (e.g. VAN loading the next contact)
  // don't pop the QR code modal back open over an existing pairing.
  pairedChannelId: sessionStoredSignal<string | undefined>(
    "turboVpbPairedChannel",
    undefined,
  ),
  // Ids of the phone's messages already acted on in this browser session
  // (see claimMessage). Persisted because on VAN each contact is a new page.
  handledMessages: sessionStoredSignal<string[]>("turboVpbHandledMessages", []),
  // Starts hidden; shown once storage has loaded if we aren't paired yet
  // (see autoShowQrCodeModal) to avoid flashing it over a paired session.
  showQrCodeModal: signal(false),
  resultCodes: signal(undefined as string[] | undefined),
  currentContact: signal(undefined as ContactDetails | undefined),
  lastCallResult: signal(undefined as string | undefined),
  scrapingConfidence: signal("high" as ScrapeConfidence),
};

export const serverUrl = computed(() => {
  const url = state.settings.value?.serverUrl;
  if (url && !isAllowedServerUrl(url)) {
    console.error("Custom server URL must use HTTPS, falling back to default");
    return DEFAULT_SERVER_URL;
  }
  return url || DEFAULT_SERVER_URL;
});

// SECURITY NOTE: The encryption key is placed in the URL fragment (hash)
// so the server never receives it. Accepted tradeoffs:
// - The key is visible in the QR code displayed on the phone bank page
// - Browser history stores the full URL including the hash
// - Other extensions with tabs permission can read the URL
// This is an intentional design choice: fragment-based key exchange avoids
// server-side key exposure, and the QR code is the primary pairing mechanism.
export const connectUrl = computed(() => {
  const details = state.connectionDetails.value;
  if (!details) {
    return;
  }

  try {
    const url = new URL("/connect", serverUrl.value);
    url.searchParams.set("sessionId", details.sessionId);
    url.searchParams.set("version", browser.runtime.getManifest().version);
    url.searchParams.set("userAgent", encodeURIComponent(navigator.userAgent));
    url.searchParams.set("domain", encodeURIComponent(window.location.host));
    url.hash = `${details.channelId}&${details.encryptionKey}`;
    return url;
  } catch (e) {
    console.error("Invalid server URL", e);
  }
});

export const detailsToSend = computed(() => {
  return {
    type: "contact",
    // Send the details whenever these change
    contact: state.currentContact.value,
    yourName: state.settings.value?.yourName,
    messageTemplates: state.settings.value?.messageTemplates,
    resultCodes: state.resultCodes.value,
    stats: state.sessionStats.value,
    lastCallResult: state.lastCallResult.value,

    // Other details to send
    extensionVersion: browser.runtime.getManifest().version,
    extensionUserAgent: navigator.userAgent,
    extensionPlatform:
      (navigator as any).userAgentData?.platform || navigator.platform,
  };
});

export function showQrCodeModal() {
  state.showQrCodeModal.value = true;
}

export function hideQrCodeModal() {
  state.showQrCodeModal.value = false;
}

export const isPaired = computed(
  () =>
    !!state.pairedChannelId.value &&
    state.pairedChannelId.value === state.connectionDetails.value?.channelId,
);

// Open the modal on page load only if no phone has paired with this channel.
export function autoShowQrCodeModal() {
  if (!isPaired.value) {
    showQrCodeModal();
  }
}

// Called for every message decrypted from the phone, which proves it holds
// the channel's key.
export function handlePhoneConnected() {
  batch(() => {
    setStatus("connected");
    hideQrCodeModal();
    const channelId = state.connectionDetails.value?.channelId;
    if (channelId && state.pairedChannelId.value !== channelId) {
      state.pairedChannelId.value = channelId;
    }
  });
}

// The phone's socket drops every time the volunteer switches to the dialer
// or messaging app, and it reconnects on its own when they switch back.
// So once paired, a disconnect only updates the status instead of covering
// the page with the modal.
export function handlePhoneDisconnected() {
  batch(() => {
    setWaitingForPhone();
    if (!isPaired.value) {
      showQrCodeModal();
    }
  });
}

// Connected to the server but not (yet) to the phone
export function setWaitingForPhone() {
  setStatus(isPaired.value ? "phoneAway" : "waitingForMessage");
}

export function setLastCallResult(contacted: boolean, result?: string) {
  const resultCode = contacted ? "Contacted" : (result ?? "Unknown");
  console.log("Last call result:", resultCode);

  // Update the statistics
  batch(() => {
    state.lastCallResult.value = resultCode;

    const sessionStats = state.sessionStats.value;
    state.sessionStats.value = {
      successfulCalls: sessionStats.successfulCalls + (contacted ? 1 : 0),
      calls: sessionStats.calls + 1,
      lastContactLoadTime: Date.now(),
      startTime: sessionStats.startTime,
    };
    state.totalCalls.value += 1;

    // Keep track of the last month's daily call stats
    const date = new Date().toISOString().slice(0, 10);
    const updated = [...state.dailyCalls.value];
    let todaysRecord = updated[updated.length - 1];
    // Add a new record for today if it doesn't exist
    if (!todaysRecord || todaysRecord[0] !== date) {
      todaysRecord = [date, 0];
      updated.push(todaysRecord);

      // Limit it to 31 days of records
      if (updated.length > 31) {
        updated.shift();
      }
    }
    // Create a new tuple so the signal detects the change
    updated[updated.length - 1] = [todaysRecord[0], todaysRecord[1] + 1];
    state.dailyCalls.value = updated;
  });
}

const MAX_HANDLED_MESSAGES = 50;

type IdentifiedMessage = { seq?: unknown; timestamp?: unknown };

// Retries resend the same message. The seq restarts when the phone's page
// reloads, so the timestamp is needed to tell messages apart. Messages from
// older connect pages have no id.
function messageId(message: IdentifiedMessage): string | undefined {
  if (
    typeof message.seq !== "number" ||
    typeof message.timestamp !== "string"
  ) {
    return;
  }
  return `${message.seq}:${message.timestamp}`;
}

/**
 * Whether the phone's message was already acted on, e.g. a call result that
 * was marked. The same message can arrive more than once: the phone retries
 * a call result until it gets a response, and the server replays the phone's
 * last message whenever the extension reconnects. On VAN, where the page
 * that handled it is gone by then, it arrives at the next contact, which may
 * be someone in the same household with the same phone number.
 */
export async function isMessageHandled(
  message: IdentifiedMessage,
): Promise<boolean> {
  await state.handledMessages.loaded;
  const id = messageId(message);
  return !!id && state.handledMessages.value.includes(id);
}

/**
 * Returns true if this message hasn't been handled yet, and records it as
 * handled (once that's saved, since e.g. marking a call result may navigate
 * to a new page). Messages without an id are always claimed.
 */
export async function claimMessage(
  message: IdentifiedMessage,
): Promise<boolean> {
  if (await isMessageHandled(message)) {
    return false;
  }
  const id = messageId(message);
  if (!id) {
    return true;
  }
  state.handledMessages.value = [
    ...state.handledMessages.value.slice(-(MAX_HANDLED_MESSAGES - 1)),
    id,
  ];
  await state.handledMessages.saved;
  return true;
}

/**
 * Forget a claimed message that couldn't be handled after all, so that the
 * phone's retry of it is tried again.
 */
export async function releaseMessage(message: IdentifiedMessage) {
  const id = messageId(message);
  if (!id) {
    return;
  }
  state.handledMessages.value = state.handledMessages.value.filter(
    (handled) => handled !== id,
  );
  await state.handledMessages.saved;
}

export function setTotalCalls(totalCalls: number) {
  state.totalCalls.value = totalCalls;
}

export function setResultCodes(resultCodes: string[]) {
  state.resultCodes.value = resultCodes;
}

export function setContactDetails(contactDetails: ContactDetails | undefined) {
  batch(() => {
    const oldContact = state.currentContact.value;
    if (contactDetails && !contactsAreEqual(oldContact, contactDetails)) {
      console.log("New contact", contactDetails);
      state.currentContact.value = contactDetails;
      state.scrapingConfidence.value = contactDetails.confidence;
    }
  });
}

export async function setPubsubClient(client: PubSubClient) {
  const encryptionKey = await client.exportEncryptionKey();

  batch(() => {
    state.pubsubClient.value = client;
    state.connectionDetails.value = {
      encryptionKey,
      sessionId: state.connectionDetails.value?.sessionId || randomId(16),
      channelId: client.channelId,
    };
  });
}

export function setStatus(status: ConnectionStatus) {
  console.log(status);
  state.status.value = status;
}

function contactsAreEqual(
  a: ContactDetails | undefined,
  b: ContactDetails | undefined,
) {
  return (
    a?.phoneNumber === b?.phoneNumber &&
    a?.firstName === b?.firstName &&
    a?.lastName === b?.lastName
  );
}

export const isConnectedToServer = computed(
  () =>
    state.status.value === "connected" ||
    state.status.value === "waitingForMessage" ||
    state.status.value === "phoneAway",
);
