import { generateKey, randomId, encrypt, decrypt, exportKey } from "./crypto";
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
  }

  async connect(): Promise<void> {
    if (!this.encryptionKey) {
      this.encryptionKey = await generateKey();
    }

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
          }
          return;
        }
        const data = await (msg.data as Blob).arrayBuffer();
        const decrypted = await decrypt(this.encryptionKey!, data);
        this.onmessage(decrypted);
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
    this.ws.close();
  }

  getChannelId() {
    return this.channelId;
  }

  async exportEncryptionKey() {
    return await exportKey(this.encryptionKey!);
  }

  disconnect() {
    this.ws.close();
  }

  // Send messages via HTTP POST for immediate delivery confirmation.
  // The server stores the message so late-joining subscribers get it,
  // regardless of whether there's an active receiver right now.
  async send(message: any): Promise<boolean> {
    const encrypted = await encrypt(this.encryptionKey!, message);
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
