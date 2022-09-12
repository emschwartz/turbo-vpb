import { h, render } from "preact";
import TurboVpbContainer from "../components/turbovpb-container";
import PubSubClient from "../lib/pubsub-client";
import { signal, effect, batch, computed } from "@preact/signals";
import {
  ConnectionStatus,
  ContactDetails,
  Stats,
  ConnectionDetails,
  ExtensionSettings,
} from "../lib/types";
import { importKey, randomId } from "../lib/crypto";
import { browser } from "webextension-polyfill-ts";
import { selectIntegration } from "../lib/vpb-integrations";
import { sessionStoredSignal } from "../lib/stored-signal";

const DEFAULT_SERVER_URL = "http://localhost:8080";

console.log("TurboVPB content script loaded");

const vpb = selectIntegration();
const settings = signal({} as ExtensionSettings);
const serverUrl = computed(
  () => settings.value.serverUrl || DEFAULT_SERVER_URL
);

const status = signal("connectinToServer" as ConnectionStatus);
const connectionDetails = sessionStoredSignal<ConnectionDetails | undefined>(
  "turboVpbConnection",
  undefined
);
const connectUrl = computed(() => {
  const details = connectionDetails.value;
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
const currentContact = signal(undefined as ContactDetails | undefined);
const resultCodes = signal(undefined as string[] | undefined);
const stats = sessionStoredSignal<Stats>("turboVpbStats", {
  calls: 0,
  successfulCalls: 0,
  startTime: Date.now(),
});

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
  console.log("Checking for new contact");
  batch(() => {
    const newContact = vpb.scrapeContactDetails();
    if (currentContact.value && currentContact.value !== newContact) {
      stats.value.calls++;
      stats.value.lastContactLoadTime = Date.now();
    }
    currentContact.value = newContact;
    resultCodes.value = vpb.scrapeResultCodes();
  });
}

const sidebar = vpb.turboVpbContainerLocation();
console.log(sidebar);
if (sidebar) {
  console.log("rendering turbovpb container");
  render(
    <TurboVpbContainer
      phonebankType={vpb.type}
      status={status}
      connectUrl={connectUrl}
    />,
    sidebar
  );
} else {
  console.error("Could not find sidebar container");
}

async function connect() {
  // Load the extension settings and keep them updated when they change
  settings.value = await browser.storage.local.get([
    "serverUrl",
    "yourName",
    "messageTemplates",
  ]);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      batch(() => {
        if (changes.serverUrl) {
          settings.value.serverUrl = changes.serverUrl.newValue;
        }
        if (changes.yourName) {
          settings.value.yourName = changes.yourName.newValue;
        }
        if (changes.messageTemplates) {
          settings.value.messageTemplates = changes.messageTemplates.newValue;
        }
      });
    }
  });
  console.log("Loaded settings");

  const client = new PubSubClient(
    serverUrl.value,
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
      vpb.markResult(message.result);
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

    // TODO only send a diff of these details after the first message
    await client.send({
      type: "contact",
      contact,
      resultCodes: resultCodes.value,
      stats: stats.value,
      messageTemplates: settings.value.messageTemplates,
    });
  }
}

connect().catch(console.error);
