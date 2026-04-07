import { render } from "preact";
import { batch, effect } from "@preact/signals";
import { browser } from "wxt/browser";
import { importKey } from "../../lib/crypto";
import { normalizePhoneNumber } from "../../lib/phone";
import PubSubClient from "../../lib/pubsub-client";
import { selectIntegration } from "../../lib/vpb-integrations";
import QrCodeModal from "../../components/qr-code-modal";
import QrCodeInsert from "../../components/qr-code-insert";
import { DailyCallHistory, MessageTemplateDetails } from "../../lib/types";
import { SentPhoneTracker } from "../../lib/sent-phone-tracker";
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
    ...(import.meta.env.DEV
      ? [
          "http://localhost/test-phonebank*",
          "http://localhost:8080/test-phonebank*",
        ]
      : []),
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
    if (import.meta.env.DEV) {
      listenForTestMessages(ctx);
    }
    // Wait for both settings and persisted connection details to load
    // before connecting. The connection details come from storage.session
    // via message passing (async), so we must await them to reuse an
    // existing channelId after a page reload.
    Promise.all([loadSettings(), state.connectionDetails.loaded])
      .then(connectPubsubClient)
      .catch((err) => {
        console.error("Failed to connect to server:", err);
        setStatus("disconnected");
      });
    const disposeHideQrCode = effect(() => {
      if (state.status.value === "connected") {
        hideQrCodeModal();
      }
    });
    ctx.onInvalidated(disposeHideQrCode);
    const disposeSaveStats = effect(() => {
      browser.storage.local
        .set({
          totalCalls: state.totalCalls.value,
          dailyCalls: state.dailyCalls.value,
        })
        .catch(console.error);
    });
    ctx.onInvalidated(disposeSaveStats);
    // Register call result handler once, outside of effects
    vpb.onCallResult(setLastCallResult);

    // Track phone numbers we've sent to the mobile browser,
    // so we can distinguish late/duplicate results from unknown ones.
    const sentPhoneNumbers = new SentPhoneTracker(500);

    // Send the contact details whenever there is a new contact
    const disposeSendContact = effect(() => {
      if (state.pubsubClient.value && detailsToSend.value) {
        console.log("Sending contact details", detailsToSend.value);
        const phone = detailsToSend.value.contact?.phoneNumber;
        if (phone) {
          sentPhoneNumbers.add(normalizePhoneNumber(phone));
        }
        state.pubsubClient.value?.send(detailsToSend.value);
      }
    });
    ctx.onInvalidated(disposeSendContact);

    async function handleCallResult(message: any) {
      const incomingPhone = message.phoneNumber
        ? normalizePhoneNumber(message.phoneNumber)
        : undefined;
      const currentPhone = state.currentContact.value?.phoneNumber
        ? normalizePhoneNumber(state.currentContact.value.phoneNumber)
        : undefined;

      // Legacy callResult without phoneNumber (older connect page).
      // Mark the result and send old-style ACK for backwards compatibility.
      if (!incomingPhone) {
        console.warn("callResult missing phoneNumber, marking anyway");
        state.pubsubClient.value?.send({
          type: "ack",
          ackType: "callResult",
          seq: message.seq,
        });
        try {
          await vpb.markResult(message.result);
        } catch (err) {
          console.error("Failed to mark result:", err);
        }
        return;
      }

      // Phone mismatch: reject the result
      if (incomingPhone !== currentPhone) {
        const reason = sentPhoneNumbers.has(incomingPhone)
          ? "already_processed"
          : "unknown_phone";
        console.log(
          `Rejecting callResult (${reason}):`,
          incomingPhone,
          "current:",
          currentPhone,
        );
        state.pubsubClient.value?.send({
          type: "callResultResponse",
          seq: message.seq,
          status: "rejected",
          phoneNumber: incomingPhone,
        });
        return;
      }

      // Phone match: mark the result, then send response with next contact
      console.log("Marking result:", message.result);
      try {
        await vpb.markResult(message.result);
      } catch (err) {
        console.error("Failed to mark result:", err);
      }

      // Wait briefly for the next contact to appear (MutationObserver
      // fires after markResult clicks "Save & Next").
      const nextContact = await waitForContactChange(currentPhone, 2000);

      // Build the response payload. Spread detailsToSend first so our
      // callResultResponse fields (especially type) take precedence.
      const details = nextContact ? detailsToSend.value : {};
      state.pubsubClient.value?.send({
        ...details,
        type: "callResultResponse",
        seq: message.seq,
        status: "applied",
        phoneNumber: incomingPhone,
      });
    }

    function waitForContactChange(
      currentNormalizedPhone: string,
      timeoutMs: number,
    ): Promise<boolean> {
      return new Promise((resolve) => {
        // Check if the contact already changed
        const check = () => {
          const phone = state.currentContact.value?.phoneNumber;
          return phone
            ? normalizePhoneNumber(phone) !== currentNormalizedPhone
            : false;
        };
        if (check()) {
          resolve(true);
          return;
        }

        const timer = setTimeout(() => {
          cleanup();
          resolve(false);
        }, timeoutMs);

        const cleanup = effect(() => {
          if (check()) {
            clearTimeout(timer);
            // Dispose this effect on next microtask to avoid
            // calling dispose inside its own execution.
            queueMicrotask(() => cleanup());
            resolve(true);
          }
        });
      });
    }

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

      // Use MutationObserver for near-instant detection of contact changes.
      // No debounce needed: scraping is cheap (a few DOM queries) and
      // setContactDetails already deduplicates via equality check.
      const observer = new MutationObserver(() => {
        checkForNewContact();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      ctx.onInvalidated(() => observer.disconnect());

      // Fallback poll for edge cases the observer might miss.
      ctx.setInterval(checkForNewContact, 2000);
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
              scrapingConfidence={state.scrapingConfidence}
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

    let connectingPromise: Promise<void> | null = null;

    // Load the settings from localStorage and connect to the server
    async function connectPubsubClient() {
      if (isConnectedToServer.value) {
        console.log("Already connected, not reconnecting");
        return;
      }

      if (connectingPromise) {
        console.log("Connection already in progress, waiting");
        return connectingPromise;
      }

      connectingPromise = doConnect();
      try {
        await connectingPromise;
      } finally {
        connectingPromise = null;
      }
    }

    async function doConnect() {
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
        // and the browser page is already open and connected.
        // Retry once if the first attempt fails.
        let sent = await client.send({ type: "connect" });
        if (!sent) {
          console.warn("Connect send failed, retrying once");
          sent = await client.send({ type: "connect" });
        }
        if (!sent) {
          console.error("Connect send failed after retry");
        }
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
          await handleCallResult(message);
        } else if (message.type === "ack") {
          // Ack messages are handled by PubSubClient internally
        } else {
          console.error("Unknown message type", message);
        }
      };

      await client.connect();
      await setPubsubClient(client);
    }

    // Dev-only: allow tests to set extension storage from the page context
    // via window.postMessage. Tree-shaken out of production builds.
    function listenForTestMessages(ctx: any) {
      const handler = async (event: MessageEvent) => {
        // Only accept test messages from localhost
        if (
          !event.origin.startsWith("http://localhost") &&
          !event.origin.startsWith("http://127.0.0.1")
        ) {
          return;
        }
        if (event.data?.type === "turbovpb-test:storage.local.set") {
          browser.storage.local.set(event.data.data).catch(console.error);
        } else if (event.data?.type === "turbovpb-test:inject-content-script") {
          browser.runtime.sendMessage({
            type: "injectContentScript",
            urlPattern: event.data.urlPattern,
          });
        } else if (event.data?.type === "turbovpb-test:inject-call-result") {
          await handleCallResult(event.data.message);
        }
      };
      window.addEventListener("message", handler);
      ctx.onInvalidated(() => window.removeEventListener("message", handler));
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
