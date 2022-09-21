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

export const state = signal({
  settings: undefined as ExtensionSettings | undefined,
  pubsubClient: undefined as PubSubClient | undefined,
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

    // Don't send the details when these change
    messageTemplates: currentState.settings.messageTemplates,
    resultCodes: currentState.resultCodes,
    stats: currentState.sessionStats.value,
    lastCallResult: currentState.lastCallResult,

    // Other details to send
    extensionVersion: browser.runtime.getManifest().version,
    extensionUserAgent: navigator.userAgent,
    extensionPlatform: navigator.platform,
  };
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
      state.value.sessionStats.value.successfulCalls += 1;
    }
  });
}

export function setTotalCalls(totalCalls: number) {
  const total = state.value.totalCalls;
  total.value = totalCalls;
  state.value.totalCalls = total;
}

export const totalCalls = computed(() => state.value.totalCalls.value);
export const dailyCalls = computed(() => state.value.dailyCalls.value);

export function setResultCodes(resultCodes: string[]) {
  state.value.resultCodes = resultCodes;
}

export function setContactDetails(contactDetails: ContactDetails) {
  batch(() => {
    const oldContact = state.value.currentContact.value;
    if (!contactsAreEqual(oldContact, contactDetails)) {
      console.log("New contact", contactDetails);

      state.value.sessionStats.value.calls += 1;
      state.value.sessionStats.value.lastContactLoadTime = Date.now();
      state.value.currentContact.value = contactDetails;
      state.value.totalCalls.value += 1;

      // Keep track of the last month's daily call stats
      const date = new Date().toLocaleDateString();
      const dailyCalls = state.value.dailyCalls;
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
      state.value.dailyCalls = dailyCalls;
    }
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
