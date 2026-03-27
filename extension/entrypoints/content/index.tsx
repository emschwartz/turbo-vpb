import { render } from "preact";
import { batch, effect } from "@preact/signals";
import { browser } from "wxt/browser";
import { importKey } from "../../lib/crypto";
import PubSubClient from "../../lib/pubsub-client";
import { selectIntegration } from "../../lib/vpb-integrations";
import QrCodeModal from "../../components/qr-code-modal";
import QrCodeInsert from "../../components/qr-code-insert";
import { DailyCallHistory, MessageTemplateDetails } from "../../lib/types";
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
import "../../assets/main.css";

export default defineContentScript({
  matches: [
    "https://www.openvpb.com/VirtualPhoneBank*",
    "https://*.everyaction.com/ContactDetailScript*",
    "https://www.votebuilder.com/ContactDetailScript*",
    "https://phonebank.bluevote.com/*",
    "https://*/ContactDetailScript*",
    "https://*.turbovpb.com/test-phonebank",
    ...(import.meta.env.DEV ? ["http://localhost/test-phonebank*"] : []),
  ],

  main(ctx) {
    // Startup routine when the content script is loaded
    const vpb = selectIntegration();
    console.log(
      `TurboVPB content script loaded and using ${vpb.type} integration`,
    );
    watchForSidebar();
    watchForResultCodes();
    watchForNewContacts();
    listenForExtensionMessages();
    loadSettings()
      .then(connectPubsubClient)
      .catch((err) => {
        console.error("Failed to connect to server:", err);
        setStatus("disconnected");
      });
    effect(() => {
      if (state.status.value === "connected") {
        hideQrCodeModal();
      }
    });
    effect(() => {
      browser.storage.local
        .set({
          totalCalls: state.totalCalls.value,
          dailyCalls: state.dailyCalls.value,
        })
        .catch(console.error);
    });
    // Register call result handler once, outside of effects
    vpb.onCallResult(setLastCallResult);

    // Send the contact details whenever there is a new contact
    effect(() => {
      if (state.pubsubClient.value && detailsToSend.value) {
        console.log("Sending contact details", detailsToSend.value);
        state.pubsubClient.value?.send(detailsToSend.value);
      }
    });

    function listenForExtensionMessages() {
      const handler = (message: any) => {
        if (message.type === "openQrCodeModal") {
          showQrCodeModal();
        }
      };
      browser.runtime.onMessage.addListener(handler);
      ctx.onInvalidated(() =>
        browser.runtime.onMessage.removeListener(handler),
      );
    }

    function watchForNewContacts() {
      checkForNewContact();
      ctx.setInterval(checkForNewContact, 500);
    }

    function checkForNewContact() {
      setContactDetails(vpb.scrapeContactDetails());
    }

    function watchForSidebar() {
      const interval = ctx.setInterval(() => {
        if (injectSidebar()) {
          clearInterval(interval);
        }
      }, 200);
    }

    function watchForResultCodes() {
      let attempts = 0;
      const maxAttempts = 150; // 30 seconds at 200ms intervals
      const interval = ctx.setInterval(async () => {
        attempts++;
        const resultCodes = await vpb.scrapeResultCodes();
        if (resultCodes && resultCodes.length > 0) {
          console.log("Scraped result codes", resultCodes);
          setResultCodes(resultCodes);
          clearInterval(interval);
        } else if (attempts >= maxAttempts) {
          console.warn("Gave up waiting for result codes after 30s");
          clearInterval(interval);
        }
      }, 200);
    }

    // Insert the TurboVPB container and modal into the page
    function injectSidebar(): boolean {
      if (document.getElementById("turbovpb-insert")) {
        return true;
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
          parent,
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
          : undefined,
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
      client.onpeerdisconnected = () => {
        setStatus("waitingForMessage");
        gotMessageSinceLastReconnect = false;
        showQrCodeModal();
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
        hideQrCodeModal();
        gotMessageSinceLastReconnect = true;

        console.log("Received message:", message);

        // Send the details as soon as we receive a connect message
        if (message.type === "connect" && detailsToSend.value.contact) {
          console.log("Sending contact details in response to connect message");
          await client.send(detailsToSend.value);
        } else if (message.type === "callResult") {
          console.log("Marking result:", message.result);
          // Ack immediately so the mobile page knows we received it
          await client.send({
            type: "ack",
            ackType: "callResult",
            seq: message.seq,
          });
          try {
            await vpb.markResult(message.result);
          } catch (err) {
            console.error("Failed to mark result:", err);
          }
        } else if (message.type === "ack") {
          // Ack messages are handled by PubSubClient internally
        } else {
          console.error("Unknown message type", message);
        }
      };

      await client.connect();
      await setPubsubClient(client);

      // Notify the mobile page immediately when this tab is closed
      const disconnectUrl = `${serverUrl.value}/api/channels/${client.channelId}/extension/disconnect`;
      const onPageHide = () => navigator.sendBeacon(disconnectUrl);
      window.addEventListener("pagehide", onPageHide);
      ctx.onInvalidated(() =>
        window.removeEventListener("pagehide", onPageHide),
      );
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
          serverUrl: stored.serverUrl as string | undefined,
          yourName: stored.yourName as string | undefined,
          messageTemplates: stored.messageTemplates as
            | MessageTemplateDetails[]
            | undefined,
        };
        if (stored.totalCalls) {
          setTotalCalls(stored.totalCalls as number);
        }
        if (stored.dailyCalls) {
          state.dailyCalls.value = stored.dailyCalls as DailyCallHistory;
        }
      });

      const onChangedHandler = (changes: any, area: string) => {
        if (area === "local") {
          state.settings.value = {
            serverUrl:
              changes.serverUrl?.newValue ?? state.settings.value?.serverUrl,
            yourName:
              changes.yourName?.newValue ?? state.settings.value?.yourName,
            messageTemplates:
              changes.messageTemplates?.newValue ??
              state.settings.value?.messageTemplates,
          };
        }
      };
      browser.storage.onChanged.addListener(onChangedHandler);
      ctx.onInvalidated(() =>
        browser.storage.onChanged.removeListener(onChangedHandler),
      );
    }
  },
});
