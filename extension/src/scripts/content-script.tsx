import { h, render } from "preact";
import TurboVpbContainer from "../components/turbovpb-container";
import PubSubClient from "../lib/pubsub-client";
import { signal, effect, batch, computed } from "@preact/signals";
import {
  ConnectionStatus,
  ContactDetails,
  Stats,
  ConnectionDetails,
} from "../lib/types";
import { importKey, randomId } from "../lib/crypto";
import { browser } from "webextension-polyfill-ts";
import integrations from "../lib/vpb-integrations";
import storedSignal from "../lib/stored-signal";

console.log("TurboVPB content script loaded");

const serverBase = "http://localhost:8080";

const status = signal("connectinToServer" as ConnectionStatus);
const connectionDetails = storedSignal<ConnectionDetails | undefined>(
  "turboVpbConnection",
  undefined
);
const connectUrl = computed(() => {
  const details = connectionDetails.value;
  if (!details) {
    return;
  }

  const url = new URL("/connect", serverBase);
  url.searchParams.set("sessionId", details.sessionId);
  url.searchParams.set("version", browser.runtime.getManifest().version);
  url.searchParams.set("userAgent", encodeURIComponent(navigator.userAgent));
  url.searchParams.set("domain", encodeURIComponent(window.location.host));
  url.hash = `${details.channelId}&${details.encryptionKey}`;
  return url;
});
const currentContact = signal(undefined as ContactDetails | undefined);
const resultCodes = signal(undefined as string[] | undefined);
const stats = storedSignal<Stats>("turboVpbStats", {
  calls: 0,
  successfulCalls: 0,
  startTime: Date.now(),
});

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
      stats.value.lastContactLoadTime = Date.now();
    }
    currentContact.value = newContact;
    resultCodes.value = integrations.openvpb.scrapeResultCodes();
  });
}

async function connect() {
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

    // Send the details as soon as we receive a connect message
    if (message.type === "connect") {
      await sendContactDetails();
    } else if (message.type === "callResult") {
      integrations.openvpb.markResult(message.result);
    } else {
      console.error("Unknown message type", message);
    }
  };
  // Disconnect if there is no contact
  const contactTimeout = setTimeout(() => {
    console.log("No contact found, disconnecting from server");
    connectionDetails.value = undefined;
    client.close();
  }, 10000);

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
  effect(() => {
    if (!!currentContact.value) {
      clearTimeout(contactTimeout);
    }
    sendContactDetails();
  });

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
}

connect().catch(console.error);
