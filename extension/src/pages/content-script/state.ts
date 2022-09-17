import { signal, computed, batch } from "@preact/signals";
import PubSubClient from "../../lib/pubsub-client";
import { sessionStoredSignal } from "../../lib/stored-signal";
import {
  ConnectionDetails,
  ConnectionStatus,
  ContactDetails,
  ExtensionSettings,
  Stats,
} from "../../lib/types";
import { browser } from "webextension-polyfill-ts";
import { randomId } from "../../lib/crypto";

const DEFAULT_SERVER_URL = "http://localhost:8080";

export const state = signal({
  settings: undefined as ExtensionSettings | undefined,
  pubsubClient: undefined as PubSubClient | undefined,
  status: signal("connectingToServer" as ConnectionStatus),
  connectionDetails: sessionStoredSignal<ConnectionDetails | undefined>(
    "turboVpbConnection",
    undefined
  ),
  stats: sessionStoredSignal<Stats>("turboVpbStats", {
    calls: 0,
    successfulCalls: 0,
    startTime: Date.now(),
  }),
  showQrCodeModal: signal(true),
  resultCodes: undefined as string[] | undefined,
  currentContact: signal(undefined as ContactDetails | undefined),
  lastCallResult: undefined as string | undefined,
});

export const serverUrl = computed(
  () => state.value.settings?.serverUrl || DEFAULT_SERVER_URL
);

export const connectUrl = computed(() => {
  const details = state.value.connectionDetails.value;
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
  const currentState = state.peek();
  const details = {
    type: "contact",
    // Send the details whenever these change
    contact: currentState.currentContact.value,
    messageTemplates: currentState.settings.messageTemplates,

    // Don't send the details when these change
    resultCodes: currentState.resultCodes,
    stats: currentState.stats.value,
    lastCallResult: currentState.lastCallResult,

    // Other details to send
    extensionVersion: browser.runtime.getManifest().version,
    extensionUserAgent: navigator.userAgent,
    extensionPlatform: navigator.platform,
  };
  console.log(details);
  return details;
});

export function showQrCodeModal() {
  state.value.showQrCodeModal.value = true;
}

export function hideQrCodeModal() {
  state.value.showQrCodeModal.value = false;
}

export function setLastCallResult(contacted: boolean, result: string) {
  batch(() => {
    state.value.lastCallResult = result;

    if (contacted) {
      state.value.stats.value.successfulCalls += 1;
    }
  });
}

export function setContactDetailsAndResultCodes(
  contactDetails: ContactDetails,
  resultCodes: string[]
) {
  batch(() => {
    const oldContact = state.value.currentContact.value;
    if (!contactsAreEqual(oldContact, contactDetails)) {
      state.value.stats.value.calls += 1;
      state.value.stats.value.lastContactLoadTime = Date.now();
      state.value.currentContact.value = contactDetails;
    }

    state.value.resultCodes = resultCodes;
  });
}

export async function setPubsubClient(client: PubSubClient) {
  const encryptionKey = await client.exportEncryptionKey();

  batch(() => {
    state.value.pubsubClient = client;
    state.value.connectionDetails.value = {
      encryptionKey,
      sessionId: state.value.connectionDetails.value?.sessionId || randomId(16),
      channelId: client.channelId,
    };
  });
}

export function setStatus(status: ConnectionStatus) {
  console.log(status);
  state.value.status.value = status;
}

function contactsAreEqual(a: ContactDetails, b: ContactDetails) {
  return (
    a?.phoneNumber === b?.phoneNumber &&
    a?.firstName === b?.firstName &&
    a?.lastName === b?.lastName
  );
}

export const isConnectedToServer = computed(
  () =>
    state.value.status.value === "connected" ||
    state.value.status.value === "waitingForMessage"
);
