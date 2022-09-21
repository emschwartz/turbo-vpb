import { render } from "preact";
import { batch, effect } from "@preact/signals";
import { browser } from "webextension-polyfill-ts";
import { importKey } from "../../lib/crypto";
import PubSubClient from "../../lib/pubsub-client";
import { selectIntegration } from "../../lib/vpb-integrations";
import QrCodeModal from "../../components/qr-code-modal";
import QrCodeInsert from "../../components/qr-code-insert";
import {
  hideQrCodeModal,
  setContactDetails,
  setLastCallResult,
  state,
  connectUrl,
  showQrCodeModal,
  serverUrl,
  setStatus,
  detailsToSend,
  isConnectedToServer,
  setPubsubClient,
  setTotalCalls,
  setResultCodes,
} from "./state";
import "../../index.css";

// Startup routine when the content script is loaded
const vpb = selectIntegration();
console.log(`TurboVPB content script loaded and using ${vpb.type} integration`);
watchForSidebar();
watchForResultCodes();
watchForNewContacts();
listenForExtensionMessages();
loadSettings().then(connectPubsubClient).catch(console.error);
effect(() => {
  if (state.status.value === "connected") {
    hideQrCodeModal();
  }
});
effect(() => {
  console.log("saving total calls", state.totalCalls.value);
  browser.storage.local
    .set({
      totalCalls: state.totalCalls.value,
      dailyCalls: state.dailyCalls.value,
    })
    .catch(console.error);
});
// Send the contact details whenever there is a new contact
effect(() => {
  if (state.pubsubClient.value) {
    console.log("Sending contact details", detailsToSend.value);
    state.pubsubClient.value?.send(detailsToSend.value);
  }

  vpb.onCallResult(setLastCallResult);
});
effect(() => {
  console.log(state.sessionStats.value);
});

function listenForExtensionMessages() {
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "openQrCodeModal") {
      showQrCodeModal();
    }
  });
}

function watchForNewContacts() {
  checkForNewContact();
  setInterval(checkForNewContact, 500);
}

function checkForNewContact() {
  setContactDetails(vpb.scrapeContactDetails());
}

function watchForSidebar() {
  const interval = setInterval(() => {
    if (injectSidebar()) {
      clearInterval(interval);
    }
  }, 200);
}

function watchForResultCodes() {
  const interval = setInterval(async () => {
    const resultCodes = await vpb.scrapeResultCodes();
    if (resultCodes && resultCodes.length > 0) {
      console.log("Scraped result codes", resultCodes);
      setResultCodes(resultCodes);
      clearInterval(interval);
    }
  }, 200);
}

// Insert the TurboVPB container and modal into the page
function injectSidebar(): boolean {
  if (document.getElementById("turbovpb-insert")) {
    return;
  }
  const parent = vpb.turboVpbContainerLocation();
  if (parent) {
    console.log("Rendering turbovpb container");
    // TODO ensure this doesn't render multiple times
    render(
      <div id="turbovpb-insert">
        <QrCodeInsert
          hide={state.showQrCodeModal}
          status={state.status}
          connectUrl={connectUrl}
        />
        <QrCodeModal
          open={state.showQrCodeModal}
          status={state.status}
          connectUrl={connectUrl}
        />
      </div>,
      parent
    );
    return true;
  } else {
    return false;
  }
}

// Load the settings from localStorage and connect to the server
async function connectPubsubClient() {
  if (isConnectedToServer.value) {
    console.log("Already connected, not reconnecting");
    return;
  }

  const client = new PubSubClient(
    serverUrl.value,
    state.connectionDetails.value?.channelId,
    state.connectionDetails.value?.encryptionKey
      ? await importKey(state.connectionDetails.value.encryptionKey)
      : undefined
  );
  let gotMessageSinceLastReconnect = false;

  // Handle pubsub events
  client.onopen = async () => {
    console.log("connected");
    if (!gotMessageSinceLastReconnect) {
      setStatus("waitingForMessage");
    }

    // Send a message to the browser in case we reloaded the page
    // and the browser page is already open and connected
    await client.send({
      type: "connect",
    });
  };
  client.onclose = () => {
    setStatus("disconnected");
    gotMessageSinceLastReconnect = false;
  };
  client.onerror = () => {
    setStatus("disconnected");
    gotMessageSinceLastReconnect = false;
  };
  client.onmessage = async (message) => {
    setStatus("connected");
    gotMessageSinceLastReconnect = true;

    console.log("Received message:", message);

    // Send the details as soon as we receive a connect message
    if (message.type === "connect") {
      console.log("Sending contact details in response to connect message");
      await client.send(detailsToSend.value);
    } else if (message.type === "callResult") {
      console.log("Marking result:", message.result);
      await vpb.markResult(message.result);
    } else {
      console.error("Unknown message type", message);
    }
  };

  await client.connect();
  await setPubsubClient(client);
}

async function loadSettings() {
  const stored = await browser.storage.local.get([
    "serverUrl",
    "yourName",
    "messageTemplates",
    "totalCalls",
    "dailyCalls",
  ]);
  batch(() => {
    state.settings.value = {
      serverUrl: stored.serverUrl,
      yourName: stored.yourName,
      messageTemplates: stored.messageTemplates,
    };
    if (stored.totalCalls) {
      setTotalCalls(stored.totalCalls);
    }
    if (stored.dailyCalls) {
      state.dailyCalls.value = stored.dailyCalls;
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      state.settings.value = {
        serverUrl:
          changes.serverUrl?.newValue || state.settings.value?.serverUrl,
        yourName: changes.yourName?.newValue || state.settings.value?.yourName,
        messageTemplates:
          changes.messageTemplates?.newValue ||
          state.settings.value?.messageTemplates,
      };
    }
  });
}
