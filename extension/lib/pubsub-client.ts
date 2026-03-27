import { generateKey, randomId, encrypt, decrypt, exportKey } from "./crypto";
import ReconnectingWebSocket from "reconnecting-websocket";

export default class PubSubClient {
  ws: ReconnectingWebSocket;
  encryptionKey: CryptoKey;
  url: string;
  channelId: string;
  onmessage: (message: any) => void | Promise<void>;
  onerror: (error: any) => void;
  onclose: () => void;
  onopen: () => void;

  constructor(
    serverBase: string,
    channelId = randomId(16),
    encryptionKey?: CryptoKey,
  ) {
    this.channelId = channelId;
    this.encryptionKey = encryptionKey;
    this.url = `${serverBase.replace("http", "ws")}/api/channels/${
      this.channelId
    }/extension`;
    this.onmessage = () => {};
    this.onclose = () => {};
    this.onerror = () => {};
    this.onopen = () => {};
  }

  async connect(): Promise<void> {
    if (!this.encryptionKey) {
      this.encryptionKey = await generateKey();
    }

    this.ws = new ReconnectingWebSocket(this.url);
    this.ws.binaryType = "arraybuffer";
    console.log("connecting to", this.url);

    // Set up all the event handlers
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
    this.ws.addEventListener("message", (async (msg) => {
      const decrypted = await decrypt(this.encryptionKey, msg.data);
      this.onmessage(decrypted);
    }) as (event: MessageEvent) => void);

    // Wait for the first connection to make sure we can actually connect
    await new Promise((resolve, reject) => {
      const ws = this.ws;
      function errorHandler({ message }) {
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
    return await exportKey(this.encryptionKey);
  }

  disconnect() {
    this.ws.close();
  }

  async send(message: any) {
    const encrypted = await encrypt(this.encryptionKey, message);
    this.ws.send(encrypted);
  }
}
