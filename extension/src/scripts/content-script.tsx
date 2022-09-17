import { render } from "preact";
import { signal, effect, batch, computed } from "@preact/signals";
import { browser } from "webextension-polyfill-ts";
import {
  ConnectionStatus,
  ContactDetails,
  Stats,
  ConnectionDetails,
  ExtensionSettings,
} from "../lib/types";
import { importKey, randomId } from "../lib/crypto";
import PubSubClient from "../lib/pubsub-client";
import { selectIntegration } from "../lib/vpb-integrations";
import { sessionStoredSignal } from "../lib/stored-signal";
import QrCodeModal from "../components/qr-code-modal";
import QrCodeInsert from "../components/qr-code-insert";
import "../index.css";

const DEFAULT_SERVER_URL = "http://localhost:8080";

console.log("TurboVPB content script loaded");

const settings = signal({} as ExtensionSettings);
const serverUrl = computed(
  () => settings.value.serverUrl || DEFAULT_SERVER_URL
);

const status = signal("connectingToServer" as ConnectionStatus);
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
const lastCallResult = signal(undefined as string | undefined);
const resultCodes = signal(undefined as string[] | undefined);
const stats = sessionStoredSignal<Stats>("turboVpbStats", {
  calls: 0,
  successfulCalls: 0,
  startTime: Date.now(),
});
const showQrCodeModal = signal(true);
effect(() => {
  if (status.value === "connected") {
    showQrCodeModal.value = false;
  }
});
const vpb = selectIntegration();
vpb.onCallResult((contacted, result) => {
  batch(() => {
    lastCallResult.value = result;

    if (contacted) {
      stats.value.successfulCalls += 1;
    }
  });
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
  batch(() => {
    const newContact = vpb.scrapeContactDetails();
    if (currentContact.value && currentContact.value !== newContact) {
      stats.value.calls++;
      stats.value.lastContactLoadTime = Date.now();
    }
    currentContact.value = newContact;
    resultCodes.value = vpb.scrapeResultCodes();
  });

  if (!connectionDetails.value) {
    console.log("Got contact details, reconnecting to server");
    connect();
  }
}

const sidebar = vpb.turboVpbContainerLocation();
console.log(sidebar);
if (sidebar) {
  console.log("rendering turbovpb container");
  // TODO ensure this doesn't render multiple times
  render(
    <>
      <QrCodeInsert
        hide={showQrCodeModal}
        status={status}
        connectUrl={connectUrl}
      />
      <QrCodeModal
        open={showQrCodeModal}
        status={status}
        connectUrl={connectUrl}
      />
    </>,
    sidebar
  );
} else {
  console.error("Could not find sidebar container");
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "openQrCodeModal") {
    showQrCodeModal.value = true;
  }
});

async function connect() {
  if (status.value === "connected" || status.value === "waitingForMessage") {
    console.log("Already connected, not reconnecting");
    return;
  }

  console.log("connecting");
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
  let gotMessageSinceLastReconnect = false;
  client.onopen = async () => {
    console.log("connected");
    if (!gotMessageSinceLastReconnect) {
      status.value = "waitingForMessage";
    }

    // Send a message to the browser in case we reloaded the page
    // and the browser page is already open and connected
    await client.send({
      type: "connect",
    });
  };
  client.onclose = () => {
    console.log("disconnected");
    status.value = "disconnected";
    gotMessageSinceLastReconnect = false;
  };
  client.onerror = () => {
    console.log("disconnected");
    status.value = "disconnected";
    gotMessageSinceLastReconnect = false;
  };
  client.onmessage = async (message) => {
    status.value = "connected";
    gotMessageSinceLastReconnect = true;

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

    console.log("Sending contact details", contact);

    // TODO only send a diff of these details after the first message
    await client.send({
      type: "contact",
      contact,
      resultCodes: resultCodes.value,
      stats: stats.value,
      messageTemplates: settings.value.messageTemplates,
      extensionVersion: browser.runtime.getManifest().version,
      extensionUserAgent: navigator.userAgent,
      extensionPlatform: navigator.platform,
      lastCallResult: lastCallResult.value,
    });
  }
}

connect().catch(console.error);
