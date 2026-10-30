import {
  generateKey,
  randomId,
  encrypt,
  decryptFrom,
  exportKey,
} from "./crypto";
import ReconnectingWebSocket from "reconnecting-websocket";

const CONNECTION_TIMEOUT_MS = 10_000;

export default class PubSubClient {
  ws!: ReconnectingWebSocket;
  private encryptionKey: CryptoKey | undefined;
  wsUrl: string;
  httpUrl: string;
  channelId: string;
  onmessage: (message: any) => void | Promise<void>;
  onerror: (error: any) => void;
  onclose: () => void;
  onopen: () => void;
  onpeerdisconnected: () => void;
  onpeerconnected: () => void;
  private sendQueue: Promise<void> = Promise.resolve();
  // Whether to bind sent messages to the extension as sender. A connect page
  // older than 0.12 (e.g. on a self-hosted server) can't decrypt bound
  // messages, so this follows the last valid message from the phone: an
  // unbound one switches sending to unbound, a bound one switches it back.
  //
  // Only a key holder can produce either kind, so an attacker who knows just
  // the channel id can't flip it. Sending unbound does let anyone post our
  // messages back to us as the phone's, but only once the phone has shown
  // it is an old connect page, which can be reflected the same way anyway;
  // with a current connect page no unbound message of ours exists to
  // reflect. A bound message proves a current connect page, so switching
  // back restores the protection rather than weakening anything.
  private sendBound = true;

  constructor(
    serverBase: string,
    channelId = randomId(16),
    encryptionKey?: CryptoKey,
  ) {
    this.channelId = channelId;
    this.encryptionKey = encryptionKey;
    const channelPath = `/api/channels/${this.channelId}/extension`;
    this.wsUrl = `${serverBase.replace(/^http/, "ws")}${channelPath}`;
    this.httpUrl = `${serverBase}${channelPath}`;
    this.onmessage = () => {};
    this.onclose = () => {};
    this.onerror = () => {};
    this.onopen = () => {};
    this.onpeerdisconnected = () => {};
    this.onpeerconnected = () => {};
  }

  async connect(): Promise<void> {
    if (!this.encryptionKey) {
      this.encryptionKey = await generateKey();
    }
    // Each page load connects a new client, which starts out bound until the
    // phone shows otherwise. (Not reset when the socket reconnects: the old
    // connect page would ignore everything until it next sent a message.)
    this.sendBound = true;

    // WebSocket is used only for receiving messages
    this.ws = new ReconnectingWebSocket(this.wsUrl, [], {
      connectionTimeout: CONNECTION_TIMEOUT_MS,
    });
    // Use "blob" instead of "arraybuffer" to avoid Firefox's Xray wrapper
    // security restrictions when receiving binary data in content scripts.
    this.ws.binaryType = "blob";
    console.log("connecting to", this.wsUrl);

    this.ws.addEventListener("open", () => {
      console.log("ws opened");
      this.onopen();
    });
    this.ws.addEventListener("close", () => {
      console.log("ws closed");
      this.onclose();
    });
    this.ws.addEventListener("error", ({ message }) => {
      console.error("ws error", message);
      this.onerror(new Error(message));
    });
    this.ws.addEventListener("message", (async (msg: MessageEvent) => {
      try {
        // Text messages are unencrypted control messages from the server
        if (typeof msg.data === "string") {
          const control = JSON.parse(msg.data);
          if (
            control.type === "peerDisconnected" ||
            control.type === "peerClosed"
          ) {
            console.log("Peer disconnected");
            this.onpeerdisconnected();
          } else if (control.type === "peerConnected") {
            console.log("Peer connected");
            this.onpeerconnected();
          }
          return;
        }
        const data = await (msg.data as Blob).arrayBuffer();
        const { message, bound } = await decryptFrom(
          this.encryptionKey!,
          data,
          "browser",
        );
        this.sendBound = bound;
        this.onmessage(message);
      } catch (err) {
        console.error("Failed to process message, ignoring:", err);
      }
    }) as (event: MessageEvent) => void);

    // Wait for the first connection to make sure we can actually connect
    await new Promise((resolve, reject) => {
      const ws = this.ws;
      function errorHandler({ message }: { message: string }) {
        removeListeners();
        reject(new Error(message));
      }
      function closeHandler() {
        removeListeners();
        reject(new Error("WebSocket closed before it was opened"));
      }
      function removeListeners() {
        ws.removeEventListener("open", resolve);
        ws.removeEventListener("error", errorHandler);
        ws.removeEventListener("close", closeHandler);
      }
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", errorHandler);
      ws.addEventListener("close", closeHandler);
    });
  }

  close() {
    this.ws?.close();
  }

  async exportEncryptionKey() {
    return await exportKey(this.encryptionKey!);
  }

  // Send messages via HTTP POST for immediate delivery confirmation.
  // The server stores the message so late-joining subscribers get it,
  // regardless of whether there's an active receiver right now.
  //
  // Sends are made one at a time, in order. The server relays messages in
  // the order it receives them, and concurrent POSTs can arrive out of
  // order: when a result is saved, the previous contact is sent once more
  // with the updated stats just before the next contact, and the phone
  // would show the previous contact again if that arrived last.
  send(message: any): Promise<boolean> {
    const send = this.sendQueue.then(() => this.sendNow(message));
    this.sendQueue = send.then(() => {});
    return send;
  }

  private async sendNow(message: any): Promise<boolean> {
    const encrypted = await encrypt(
      this.encryptionKey!,
      message,
      this.sendBound ? "extension" : undefined,
    );
    try {
      const response = await fetch(this.httpUrl, {
        method: "POST",
        body: encrypted,
      });
      if (!response.ok) {
        console.error(
          "HTTP send failed:",
          response.status,
          await response.text(),
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error("HTTP send error:", err);
      return false;
    }
  }
}
