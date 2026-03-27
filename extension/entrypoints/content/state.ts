import { signal, computed, batch } from "@preact/signals";
import PubSubClient from "../../lib/pubsub-client";
import { sessionStoredSignal } from "../../lib/stored-signal";
import {
  ConnectionDetails,
  ConnectionStatus,
  ContactDetails,
  DailyCallHistory,
  ExtensionSettings,
  Stats,
} from "../../lib/types";
import { browser } from "wxt/browser";
import { randomId } from "../../lib/crypto";

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
  showQrCodeModal: signal(true),
  resultCodes: signal(undefined as string[] | undefined),
  currentContact: signal(undefined as ContactDetails | undefined),
  lastCallResult: signal(undefined as string | undefined),
};

export const serverUrl = computed(() => {
  const url = state.settings.value?.serverUrl;
  if (
    url &&
    !url.startsWith("https://") &&
    !url.startsWith("http://localhost")
  ) {
    console.error("Custom server URL must use HTTPS, falling back to default");
    return DEFAULT_SERVER_URL;
  }
  return url || DEFAULT_SERVER_URL;
});

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
    state.status.value === "waitingForMessage",
);
