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
import { browser } from "webextension-polyfill-ts";
import { randomId } from "../../lib/crypto";

const DEFAULT_SERVER_URL = "http://localhost:8080";

export const state = {
  settings: signal(undefined as ExtensionSettings | undefined),
  pubsubClient: signal(undefined as PubSubClient | undefined),
  status: signal("connectingToServer" as ConnectionStatus),
  connectionDetails: sessionStoredSignal<ConnectionDetails | undefined>(
    "turboVpbConnection",
    undefined
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

export const serverUrl = computed(
  () => state.settings.value?.serverUrl || DEFAULT_SERVER_URL
);

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
    messageTemplates: state.settings.value?.messageTemplates,
    resultCodes: state.resultCodes.value,
    stats: state.sessionStats.value,
    lastCallResult: state.lastCallResult.value,

    // Other details to send
    extensionVersion: browser.runtime.getManifest().version,
    extensionUserAgent: navigator.userAgent,
    extensionPlatform: navigator.platform,
  };
});

export function showQrCodeModal() {
  state.showQrCodeModal.value = true;
}

export function hideQrCodeModal() {
  state.showQrCodeModal.value = false;
}

export function setLastCallResult(contacted: boolean, result: string) {
  const resultCode = contacted ? "Contacted" : result;
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
    console.log(state, state.sessionStats, state.sessionStats.value);

    state.totalCalls.value += 1;

    // Keep track of the last month's daily call stats
    const date = new Date().toLocaleDateString();
    const dailyCalls = state.dailyCalls;
    let todaysRecord = dailyCalls.value[dailyCalls.value.length - 1];
    // Add a new record for today if it doesn't exist
    if (!todaysRecord || todaysRecord[0] !== date) {
      todaysRecord = [date, 0];
      dailyCalls.value.push(todaysRecord);

      // Limit it to 31 days of records
      if (dailyCalls.value.length > 31) {
        dailyCalls.value.shift();
      }
    }
    todaysRecord[1] += 1;
    state.dailyCalls = dailyCalls;
  });
}

export function setTotalCalls(totalCalls: number) {
  state.totalCalls.value = totalCalls;
}

export function setResultCodes(resultCodes: string[]) {
  state.resultCodes.value = resultCodes;
}

export function setContactDetails(contactDetails: ContactDetails) {
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

function contactsAreEqual(a: ContactDetails, b: ContactDetails) {
  return (
    a?.phoneNumber === b?.phoneNumber &&
    a?.firstName === b?.firstName &&
    a?.lastName === b?.lastName
  );
}

export const isConnectedToServer = computed(
  () =>
    state.status.value === "connected" ||
    state.status.value === "waitingForMessage"
);
