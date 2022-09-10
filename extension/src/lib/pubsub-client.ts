import { generateKey, randomId, encrypt, decrypt, exportKey } from "./crypto";

type EventType = "message" | "error" | "close";
type EventHandler = (event?: any) => void | Promise<void>;

export default class PubSubClient {
  ws: WebSocket;
  encryptionKey: CryptoKey;
  url: string;
  channelId: string;
  onmessage: (message: any) => {};
  onerror: (error: any) => {};
  onclose: () => {};

  constructor(
    serverBase: string,
    channelId = randomId(16),
    encryptionKey?: CryptoKey
  ) {
    this.channelId = channelId;
    this.encryptionKey = encryptionKey;
    this.url = `${serverBase.replace("http", "ws")}/api/channels/${
      this.channelId
    }/extension`;
  }

  async connect(): Promise<void> {
    if (!this.encryptionKey) {
      this.encryptionKey = await generateKey();
    }

    this.ws = new WebSocket(this.url);
    this.ws.onmessage = async (msg) => {
      const decrypted = await decrypt(this.encryptionKey, msg.data);
      this.onmessage(decrypted);
    };
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        console.log("ws opened");
        resolve();
      };
      this.ws.onclose = () => {
        console.log("ws closed");
        this.onclose();
        reject(new Error("WebSocket closed before it was opened"));
      };
      this.ws.onerror = async (err) => {
        console.error("ws error", err);
        this.onerror(err);
        reject(err);
      };
    });
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

  async sendMessage(message: any) {
    const encrypted = await encrypt(this.encryptionKey, message);
    this.ws.send(encrypted);
  }
}
