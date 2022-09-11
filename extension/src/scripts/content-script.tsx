import { h, render } from "preact";
import TurboVpbContainer from "../components/turbovpb-container";
import PubSubClient from "../lib/pubsub-client";
import { signal, effect, batch } from "@preact/signals";
import { ConnectionStatus, ContactDetails, Stats } from "../lib/types";
import { importKey, randomId } from "../lib/crypto";
import { browser } from "webextension-polyfill-ts";
import integrations from "../lib/vpb-integrations";

console.log("TurboVPB content script loaded");

const serverBase = "http://localhost:8080";

type TabState = {
  encryptionKey: string;
  sessionId: string;
  channelId: string;
};

const status = signal("connectinToServer" as ConnectionStatus);
const connectUrl = signal(undefined as URL | undefined);
const currentContact = signal(undefined as ContactDetails | undefined);
const resultCodes = signal(undefined as string[] | undefined);
const connectionDetails = signal(loadState());
const stats = signal(loadStats());

const sidebar = document.getElementById("openvpbsidebarcontainer");
if (sidebar) {
  console.log("rendering turbovpb container");
  render(
    <TurboVpbContainer status={status} connectUrl={connectUrl} />,
    sidebar
  );
} else {
  console.error("Could not find sidebar container");
}

console.log("watching for new contact");
const observer = new MutationObserver(checkForNewContact);
observer.observe(document, {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
});
document.onload = checkForNewContact;
checkForNewContact();

function checkForNewContact() {
  console.log("checking for new contact");
  batch(() => {
    const newContact = integrations.openvpb.scrapeContactDetails();
    if (currentContact.value && currentContact.value !== newContact) {
      stats.value.calls++;
    }
    currentContact.value = newContact;
    resultCodes.value = integrations.openvpb.scrapeResultCodes();
  });
}

async function connect() {
  // First try loading the connection details from session storage in case
  // the tab was just reloaded. This is important so that we don't reset
  // the connection details once the user may have already scanned the QR
  // code on this tab.

  const client = new PubSubClient(
    serverBase,
    connectionDetails.value?.channelId,
    connectionDetails.value?.encryptionKey
      ? await importKey(connectionDetails.value.encryptionKey)
      : undefined
  );
  client.onopen = () => {
    console.log("connected");
    status.value = "waitingForMessage";
  };
  client.onclose = () => {
    status.value = "disconnected";
  };
  client.onerror = () => {
    status.value = "disconnected";
  };
  client.onmessage = async (message) => {
    status.value = "connected";

    console.log("received message", message);

    // Send the details as soon as we receive a connect message
    if (message.type === "connect") {
      await sendContactDetails();
    }
  };
  await client.connect();
  const encryptionKey = await client.exportEncryptionKey();
  const channelId = client.channelId;
  const sessionId = connectionDetails.value?.sessionId || randomId(16);

  connectionDetails.value = {
    encryptionKey,
    sessionId,
    channelId,
  };

  // Send the contact details whenever there is a new contact
  effect(sendContactDetails);

  async function sendContactDetails() {
    const contact = currentContact.value;
    if (!contact) {
      console.error("no contact details");
      return;
    }

    console.log("sending contact details", contact);

    await client.send({
      type: "contact",
      contact,
      resultCodes: resultCodes.value,
      stats: stats.value,
    });
  }

  // Build connect URL
  const url = new URL("/connect", serverBase);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("version", browser.runtime.getManifest().version);
  url.searchParams.set("userAgent", encodeURIComponent(navigator.userAgent));
  url.searchParams.set("domain", encodeURIComponent(window.location.host));
  url.hash = `${channelId}&${encryptionKey}`;

  console.log("connect url", url.toString());

  connectUrl.value = url;
}

function loadState(): TabState | undefined {
  const state = window.sessionStorage.getItem("turboVpbConnection");
  if (state) {
    return JSON.parse(state);
  }
}

effect(saveState);
function saveState() {
  window.sessionStorage.setItem(
    "turboVpbConnection",
    JSON.stringify(connectionDetails.value)
  );
}

function loadStats(): Stats | undefined {
  const stats = window.sessionStorage.getItem("turboVpbStats");
  if (stats) {
    return JSON.parse(stats);
  } else {
    return {
      calls: 0,
      successfulCalls: 0,
      startTime: Date.now(),
    };
  }
}

effect(saveStats);
function saveStats() {
  window.sessionStorage.setItem("turboVpbStats", JSON.stringify(stats.value));
}

connect().catch(console.error);
