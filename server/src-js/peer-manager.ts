const FINAL_ERRORS = ['browser-incompatible', 'invalid-id', 'invalid-key', 'ssl-unavailable', 'unavailable-id']

const RECONNECT_BACKOFF = 2
const RECONNECT_DELAY_START = 250
const MAX_RECONNECT_DELAY = 8000
// Report an error after this many failed attempts in a row (but keep retrying)
const MAX_RECONNECT_ATTEMPTS = 5

const DEFAULT_SERVER_URL = typeof window !== 'undefined' && window.location ? window.location.href : 'https://turbovpb.com'

const ENCRYPTION_IV_BYTE_LENGTH = 12
const ENCRYPTION_ALGORITHM = 'AES-GCM'
const BASE64_URL_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const BASE64_URL_LOOKUP = new Uint8Array(256)
for (let i = 0; i < BASE64_URL_CHARACTERS.length; i++) {
  BASE64_URL_LOOKUP[BASE64_URL_CHARACTERS.charCodeAt(i)] = i
}

const enum PubSubState {
  CLOSED = 'CLOSED',
  CONNECTING = 'CONNECTING',
  OPEN = 'OPEN',
  CONNECTED = 'CONNECTED',
}

interface PeerManagerOptions {
  remotePeerId: string
  encryptionKey: string | CryptoKey | null
  // Whether the extension understands messages bound to their sender
  // (0.11.6 and later); older extensions get unbound messages
  bindMessages: boolean
  url?: string
}

// Both sides share one key, so each message has its sender bound into it as
// AES-GCM additional data. Otherwise anyone who knows the channel id (it is
// in the URL) could post the extension's own message back to it, or ours
// back to us, and it would decrypt.
const SENT_BY_EXTENSION = new TextEncoder().encode('extension')
const SENT_BY_BROWSER = new TextEncoder().encode('browser')

type PeerErrorWithType = Error & { type?: string }

class PeerManager {
  private remotePeerId: string
  private url: string
  private active: boolean
  private isConnecting: boolean
  private reconnectDelay: number
  private reconnectAttempts: number
  private reconnectResolves: Array<() => void>
  private skipReconnectDelay: (() => void) | null
  private encryptionKey: CryptoKey | null
  private bindMessages: boolean
  private ws: WebSocket | null
  private pubsubState: PubSubState
  private httpUrl: string
  private sendQueue: Promise<void> = Promise.resolve()

  onmessage: (data: unknown) => void
  onconnect: () => void | Promise<void>
  onerror: (err: PeerErrorWithType) => void
  onreconnecting: (target: string) => void
  onpeerdisconnected: () => void
  onpeerconnected: () => void
  onpeerclosed: () => void

  constructor({ remotePeerId, encryptionKey, bindMessages, url = DEFAULT_SERVER_URL }: PeerManagerOptions) {
    this.remotePeerId = remotePeerId
    this.bindMessages = bindMessages
    this.url = url

    this.active = false

    this.onmessage = () => {}
    this.onconnect = () => {}
    this.onerror = () => {}
    this.onreconnecting = () => {}
    this.onpeerdisconnected = () => {}
    this.onpeerconnected = () => {}
    this.onpeerclosed = () => {}

    this.isConnecting = false
    this.reconnectDelay = RECONNECT_DELAY_START
    this.reconnectAttempts = 0
    this.reconnectResolves = []
    this.skipReconnectDelay = null

    this.encryptionKey = encryptionKey as CryptoKey | null
    this.ws = null
    this.pubsubState = PubSubState.CLOSED
    this.httpUrl = new URL(`/api/channels/${this.remotePeerId}/browser`, this.url).toString()
  }

  static async from(opts: PeerManagerOptions): Promise<PeerManager> {
    try {
      opts.encryptionKey = await importKey(opts.encryptionKey as string)
    } catch (err) {
      console.error('Error importing encryption key', err)
      opts.encryptionKey = null
    }
    return new PeerManager(opts)
  }

  async reconnect(err?: PeerErrorWithType | null, immediate?: boolean): Promise<void> {
    if (this.active === false) {
      console.warn('The PeerManager was already stopped, not reconnecting')
      return
    }

    if (err && err.type && FINAL_ERRORS.includes(err.type)) {
      console.warn('Not retrying final error:', err.type)
      this.onerror(err)
      return
    }

    if (this.isConnecting) {
      console.log('already reconnecting')
      if (immediate && this.skipReconnectDelay) {
        // e.g. the page became visible again or the network came back
        this.skipReconnectDelay()
      }
      return new Promise<void>((resolve) => {
        this.reconnectResolves.push(resolve)
      })
    }
    this.isConnecting = true

    console.log('PeerManager reconnecting')

    // The phone is often briefly offline (e.g. during a call), so keep
    // retrying, but report the error once it has failed several times in a row
    if (++this.reconnectAttempts === MAX_RECONNECT_ATTEMPTS + 1) {
      console.error('exceeded max number of reconnect attempts, still retrying')
      this.onerror(err || new Error('Exceeded maximum number of reconnection attempts'))
    }

    if (!immediate) {
      console.log(`waiting ${this.reconnectDelay}ms before reconnecting`)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.reconnectDelay)
        this.skipReconnectDelay = () => {
          clearTimeout(timer)
          resolve()
        }
      })
      this.skipReconnectDelay = null
      this.reconnectDelay = Math.min(this.reconnectDelay * RECONNECT_BACKOFF, MAX_RECONNECT_DELAY)
    }
    if (!this.active) {
      console.warn('The PeerManager was stopped while waiting to reconnect')
      this.isConnecting = false
      this.resolveReconnects()
      return
    }
    await this.connect()
    this.reconnectDelay = RECONNECT_DELAY_START
    this.reconnectAttempts = 0
  }

  async connect(): Promise<void> {
    this.active = true
    this.isConnecting = true

    if (this.isConnected()) {
      console.log('already connected')
      this.isConnecting = false
    } else {
      console.log('connecting via websocket')

      try {
        await this._connectPubSub()
        this.isConnecting = false
        await this.onconnect()
      } catch (err) {
        this.isConnecting = false
        return this.reconnect(err as PeerErrorWithType)
      }
    }

    this.resolveReconnects()
  }

  // Resolve all of the reconnect calls that were
  // called while we were already reconnecting
  private resolveReconnects(): void {
    let resolve: (() => void) | undefined
    while ((resolve = this.reconnectResolves.pop())) {
      resolve()
    }
  }

  // Sends are made one at a time, in order, since the server relays (and
  // stores as the last message) in the order it receives them, and
  // concurrent POSTs can arrive out of order.
  sendMessage(message: unknown): Promise<boolean> {
    const send = this.sendQueue.then(() => this.sendNow(message))
    this.sendQueue = send.then(() => {})
    return send
  }

  private async sendNow(message: unknown): Promise<boolean> {
    if (this.active === false) {
      console.error('Not sending message because PeerManager has already been stopped')
      return false
    }
    console.log('sending message', message)

    // Send via HTTP POST for immediate delivery confirmation.
    // The WebSocket connection is kept open only for receiving.
    const encrypted = await encrypt(this.encryptionKey!, message, this.bindMessages ? SENT_BY_BROWSER : undefined)
    try {
      const response = await fetch(this.httpUrl, {
        method: 'POST',
        body: encrypted as unknown as BodyInit,
      })
      if (!response.ok) {
        console.error('HTTP send failed:', response.status, await response.text())
        return false
      }
      return true
    } catch (err) {
      console.error('HTTP send error:', err)
      return false
    }
  }

  stop(): void {
    console.log('stopping peer manager')
    this.active = false
    if (this.ws) {
      this.ws.onerror = () => {}
      this.ws.onclose = () => {}
      this.ws.close()
    }
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN
  }

  isStopped(): boolean {
    return !this.active
  }

  /**
   * Connect or reconnect to the WebSocket PubSub endpoint.
   * We only consider it "connected" after receiving a message
   * (rather than just when the connection opens).
   */
  private async _connectPubSub(): Promise<void> {
    if (this.pubsubState !== PubSubState.CLOSED) {
      console.log(`websocket already ${this.pubsubState.toLowerCase()}`)
      return
    }
    this.pubsubState = PubSubState.CONNECTING

    this.onreconnecting('Server')

    // Close the old websocket
    if (this.ws) {
      console.log('closing old websocket and creating a new one')
      this.ws.onclose = () => {}
      this.ws.onerror = () => {}
      this.ws.onopen = () => {}
      this.ws.onmessage = () => {}
      this.ws.close()
    }

    return new Promise<void>((resolve, reject) => {
      const url = new URL(`/api/channels/${this.remotePeerId}/browser`, this.url.replace('http', 'ws')).toString()
      console.log('connecting to:', url)
      let startTime = Date.now()
      let openTime: number | undefined
      let settled = false
      let failed = false
      // Until this promise settles, connect() is waiting on it with
      // isConnecting set, so a failure must reject it (connect() then retries).
      // Calling reconnect() instead would wait for that connect() forever.
      const handleFailure = (err: Error) => {
        this.pubsubState = PubSubState.CLOSED
        if (failed) return
        failed = true
        if (!settled) {
          settled = true
          reject(err)
        } else {
          this.reconnect(err)
        }
      }
      this.ws = new WebSocket(url)
      this.ws.binaryType = 'arraybuffer'

      this.ws.onopen = async () => {
        openTime = Date.now()
        console.log(`websocket open (took ${Date.now() - startTime}ms)`)

        this.pubsubState = PubSubState.OPEN

        // We only consider it connected when we get a message from the extension
        this.onreconnecting('Extension')
        const sent = await this.sendMessage({ type: 'connect' })
        if (!sent) {
          console.error('Failed to send connect message, triggering reconnect')
          handleFailure(new Error('Failed to send connect message'))
        }
      }
      this.ws.onclose = (event: CloseEvent) => {
        const reason = event ? event.reason : ''
        if (openTime) {
          console.warn(`websocket closed (after ${Date.now() - openTime}ms). reason: ${reason}`)
        } else {
          console.warn(`websocket closed. reason: ${reason}`)
        }
        startTime = Date.now()
        handleFailure(new Error(`WebSocket closed (reason: ${reason || 'unknown'})`))
      }
      this.ws.onerror = (event: Event) => {
        let err: Error
        if (event instanceof Error) {
          err = event
        } else if (typeof event === 'object') {
          const eventRecord = event as unknown as Record<string, unknown>
          if (eventRecord.error instanceof Error) {
            err = eventRecord.error
          } else if (typeof eventRecord.message === 'string') {
            err = new Error(`WebSocket Error: ${eventRecord.message}`)
          } else {
            err = new Error('Websocket Error')
          }
        } else {
          err = new Error('Websocket Error')
        }
        if (openTime) {
          console.error(`websocket error (after ${Date.now() - openTime}ms)`, event)
        } else {
          console.error('websocket error', event)
        }
        handleFailure(err)
      }
      this.ws.onmessage = async ({ data }: MessageEvent) => {
        try {
          // Text messages are unencrypted control messages from the server
          if (typeof data === 'string') {
            const control = JSON.parse(data)
            if (control.type === 'peerClosed') {
              console.log('Peer closed')
              this.pubsubState = PubSubState.OPEN
              this.onpeerclosed()
            } else if (control.type === 'peerDisconnected') {
              console.log('Peer disconnected')
              this.pubsubState = PubSubState.OPEN
              this.onpeerdisconnected()
            } else if (control.type === 'peerConnected') {
              console.log('Peer connected')
              this.onpeerconnected()
            }
            return
          }

          const message = await decryptFromExtension(this.encryptionKey!, data)
          console.log('got data from pubsub', message)

          if (this.pubsubState !== PubSubState.CONNECTED) {
            this.onconnect()
            this.pubsubState = PubSubState.CONNECTED
            settled = true
            resolve()
          }

          this.onmessage(message)
        } catch (err) {
          console.error('got invalid message from pubsub', err)
        }
      }
    })
  }
}

async function importKey(base64: string): Promise<CryptoKey> {
  if (!crypto || !crypto.subtle || typeof crypto.subtle.importKey !== 'function') {
    throw new Error('SubtleCrypto API is not supported')
  }
  const buffer = decodeBase64Url(base64)
  return crypto.subtle.importKey('raw', buffer, {
    name: ENCRYPTION_ALGORITHM,
  }, true, ['encrypt', 'decrypt'])
}

async function encrypt(encryptionKey: CryptoKey, message: unknown, additionalData?: Uint8Array): Promise<Uint8Array> {
  const str = typeof message === 'object' ? JSON.stringify(message) : String(message)
  const buffer = new TextEncoder().encode(str)
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTE_LENGTH))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    ...(additionalData && { additionalData }),
  }, encryptionKey, buffer))
  const payload = new Uint8Array(ciphertext.byteLength + ENCRYPTION_IV_BYTE_LENGTH)
  payload.set(ciphertext, 0)
  payload.set(iv, ciphertext.byteLength)
  return payload
}

// Accepts messages bound to the extension (0.11.6 and later) and unbound ones
// (older extensions). Accepting unbound messages from a new extension is
// safe: producing one takes the key, and we send a new extension only bound
// messages, so there are none of ours for anyone to post back to us.
async function decryptFromExtension(encryptionKey: CryptoKey, arrayBuffer: ArrayBuffer): Promise<unknown> {
  try {
    return await decrypt(encryptionKey, arrayBuffer, SENT_BY_EXTENSION)
  } catch {
    return await decrypt(encryptionKey, arrayBuffer)
  }
}

async function decrypt(encryptionKey: CryptoKey, arrayBuffer: ArrayBuffer, additionalData?: Uint8Array): Promise<unknown> {
  const payload = new Uint8Array(arrayBuffer)
  const ciphertext = payload.slice(0, 0 - ENCRYPTION_IV_BYTE_LENGTH)
  const iv = payload.slice(0 - ENCRYPTION_IV_BYTE_LENGTH)
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv,
    ...(additionalData && { additionalData }),
  }, encryptionKey, ciphertext)
  const string = new TextDecoder().decode(plaintext)
  return JSON.parse(string)
}

// Based on https://github.com/herrjemand/Base64URL-ArrayBuffer/blob/master/lib/base64url-arraybuffer.js
function decodeBase64Url(base64: string): ArrayBuffer {
  base64 = base64.replace(/[=]+$/, '')

  const bufferLength = base64.length * 0.75
  const arraybuffer = new ArrayBuffer(bufferLength)
  const bytes = new Uint8Array(arraybuffer)

  let p = 0
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = BASE64_URL_LOOKUP[base64.charCodeAt(i)]
    const encoded2 = BASE64_URL_LOOKUP[base64.charCodeAt(i + 1)]
    const encoded3 = BASE64_URL_LOOKUP[base64.charCodeAt(i + 2)]
    const encoded4 = BASE64_URL_LOOKUP[base64.charCodeAt(i + 3)]

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63)
  }

  return arraybuffer
}
