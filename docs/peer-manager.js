'use strict'

console.log('Loading PeerManager')
const FINAL_ERRORS = ['browser-incompatible', 'invalid-id', 'invalid-key', 'ssl-unavailable', 'unavailable-id']

const DEFAULT_ICE_SERVERS = [{
    "url": "stun:stun.l.google.com:19302",
    "urls": "stun:stun.l.google.com:19302"
}, {
    "url": "stun:global.stun.twilio.com:3478?transport=udp",
    "urls": "stun:global.stun.twilio.com:3478?transport=udp"
}]
const RECONNECT_BACKOFF = 10
const RECONNECT_DELAY_START = 25
const MAX_RECONNECT_ATTEMPTS = 2

const PUBLISH_URL_BASE = 'https://pubsub.turbovpb.com/c/'
const SUBSCRIBE_URL_BASE = 'wss://pubsub.turbovpb.com/c/'
const WEBRTC_MODE = 'webrtc'
const WEBSOCKET_MODE = 'websocket'

const ENCRYPTION_KEY_LENGTH = 256
const ENCRYPTION_IV_BYTE_LENGTH = 12
const ENCRYPTION_ALGORITHM = 'AES-GCM'
const BASE64_URL_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const BASE64_URL_LOOKUP = new Uint8Array(256);
for (let i = 0; i < BASE64_URL_CHARACTERS.length; i++) {
    BASE64_URL_LOOKUP[BASE64_URL_CHARACTERS.charCodeAt(i)] = i;
}

class PeerManager {
    constructor({ debugMode, remotePeerId, encryptionKey }) {
        this.debugMode = debugMode
        this.remotePeerId = remotePeerId
        this.iceServers = null

        this.active = false
        this.peer = null
        this.connection = null

        this.onmessage = () => { }
        this.onconnect = () => { }
        this.onerror = () => { }
        this.onreconnecting = () => { }

        this.isConnecting = false
        this.reconnectDelay = RECONNECT_DELAY_START
        this.reconnectAttempts = 0
        this.reconnectResolves = []

        this.encryptionKey = encryptionKey
        this.mode = this.encryptionKey ? WEBSOCKET_MODE : WEBRTC_MODE
        this.fallbackMode = this.mode === WEBRTC_MODE ? WEBSOCKET_MODE : WEBRTC_MODE
        this.ws = null
    }

    static async from(opts) {
        if (opts.encryptionKey) {
            try {
                opts.encryptionKey = await importKey(opts.encryptionKey)
            } catch (err) {
                console.error('Error importing key. WebSocket mode is disabled.', err)
                opts.encryptionKey = null
            }
            return new PeerManager(opts)
        }
    }

    async reconnect(err, immediate) {
        if (this.active === false) {
            console.warn('The PeerManager was already stopped, not reconnecting')
            return
        }

        if (err && err.type && FINAL_ERRORS.includes(err.type)) {
            console.warn('Not retrying final error:', err.type)
            return this.onerror(err)
        }

        if (this.isConnecting) {
            console.log('already reconnecting')
            return new Promise((resolve) => {
                this.reconnectResolves.push(resolve)
            })
        }
        this.isConnecting = true

        console.log('PeerManager reconnecting')

        if (++this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            console.error('exceeded max number of reconnect attempts')

            // Try swtiching to the fallback mode
            if (this.mode !== this.fallbackMode) {
                if (this.mode === WEBRTC_MODE) {
                    if (!this.encryptionKey) {
                        console.warn('cannot switch to websocket mode because the browser does not support SubtleCrypto')
                    } else {
                        console.log('switching to websocket mode')
                        this.mode = WEBSOCKET_MODE
                        this.reconnectDelay = RECONNECT_DELAY_START
                        this.reconnectAttempts = 0
                        return this.connect()
                    }
                } else {
                    console.log('switching to webrtc mode')
                    this.mode = WEBRTC_MODE
                    this.reconnectDelay = RECONNECT_DELAY_START
                    this.reconnectAttempts = 0
                    return this.connect()
                }
            }

            if (err) {
                return this.onerror(err)
            } else {
                return this.onerror(new Error('Exceeded maximum number of reconnection attempts'))
            }
        }

        if (!immediate) {
            console.log(`waiting ${this.reconnectDelay}ms before reconnecting`)
            await new Promise((resolve) => {
                setTimeout(() => {
                    this.reconnectDelay = this.reconnectDelay * RECONNECT_BACKOFF
                    resolve()
                }, this.reconnectDelay)
            })
        }
        await this.connect()
        this.reconnectDelay = RECONNECT_DELAY_START
        this.reconnectAttempts = 0
    }

    async connect(websocketMode = false) {
        this.active = true
        this.isConnecting = true

        // TODO maybe try racing both modes
        if (websocketMode) {
            if (!this.encryptionKey) {
                throw new Error('Cannot use WebSocket mode because the browser\'s cryptography API is unavailable')
            }
            this.mode = WEBSOCKET_MODE
            this.peer.onerror = () => { }
            this.peer.onclose = () => { }
            this.peer.destroy()
        }

        if (this.isConnected()) {
            console.log('already connected')
        } else {
            console.log(`connecting (mode: ${this.mode})`)

            // Use Sentry tracing to measure performance
            let span
            if (Sentry && typeof Sentry.startTransaction === 'function') {
                span = Sentry.startTransaction({
                    name: `${this.mode}.connect`,
                    tags: {
                        connection_mode: this.mode
                    }
                })
                Sentry.configureScope((scope) => scope.setSpan(span))
            }

            try {
                if (this.mode === WEBRTC_MODE) {
                    if (!this.iceServers) {
                        this.iceServers = await wrapWithTracingSpan(span, 'getIceServers', () => getIceServers())
                    }
                    await wrapWithTracingSpan(span, 'checkPeerConnected', () => this._checkPeerConnected())
                    await wrapWithTracingSpan(span, 'checkConnectionOpen', () => this._checkConnectionOpen())
                } else {
                    await wrapWithTracingSpan(span, 'connectPubSub', () => this._connectPubSub())
                }

                this.isConnecting = false
                await this.onconnect()
            } catch (err) {
                this.isConnecting = false
                return wrapWithTracingSpan(span, 'reconnect', () => this.reconnect(err))
            }

            if (span) {
                span.finish()
            }
        }

        // Resolve all of the reconnect calls that were
        // called while we were already reconnecting
        let resolve
        while (resolve = this.reconnectResolves.pop()) {
            resolve()
        }
    }

    async sendMessage(message) {
        if (this.active === false) {
            // TODO maybe it's better to throw an error here?
            console.error('Not sending message because PeerManager has already been stopped')
            return
        }
        console.log('sending message', message)

        if (this.mode === WEBRTC_MODE) {
            if (this.connection && this.connection.open) {
                this.connection.send(message)
            } else {
                console.log('trying to send message but connection is not open, reconnecting first')
                await this.reconnect()
                this.connection.send(message)
            }
        } else {
            await this._connectPubSub()
            const encrypted = await encrypt(this.encryptionKey, message)
            this.ws.send(encrypted)
        }
    }

    stop() {
        console.log('stopping peer manager')
        this.active = false
        if (this.peer) {
            this.peer.onerror = () => { }
            this.peer.onclose = () => { }
            this.peer.destroy()
        }
        if (this.ws) {
            this.ws.onerror = () => { }
            this.ws.onclose = () => { }
            this.ws.close()
        }
    }

    isConnected() {
        if (this.mode === WEBRTC_MODE) {
            return this.active
                && !!this.peer && !this.peer.disconnected && !this.peer.destroyed
                && !!this.connection && this.connection.open
        } else {
            return !!this.ws && this.ws.readyState === WebSocket.OPEN
        }
    }

    isStopped() {
        return !this.active
    }

    isWebSocketMode() {
        return this.mode === WEBSOCKET_MODE
    }

    async _checkPeerConnected() {
        if (this.peer) {
            if (!this.peer.destroyed && !this.peer.disconnected) {
                console.log('peer is still connected')
                return
            }
            console.log('peer was not connected, destroying the old one')
            this.peer.destroy()
        }

        console.log('creating new peer')
        await this.onreconnecting('Server')

        const startTime = Date.now()
        this.peer = await createPeer({
            iceServers: this.iceServers,
            debugMode: this.debugMode
        })
        console.log(`peer connected to server (took ${Date.now() - startTime}ms)`)

        this.peer.on('error', async (err) => {
            console.error('peer error', err)

            if (this.mode === WEBRTC_MODE) {
                this._closeConnection()
                return this.reconnect(err)
            }
        })
        this.peer.on('disconnect', async () => {
            console.warn('peer disconnected')

            if (this.mode === WEBRTC_MODE) {
                this._closeConnection()
                return this.reconnect()
            }
        })
    }

    _closeConnection() {
        if (this.connection) {
            this.connection.close()
            this.connection = null
        }
    }

    async _checkConnectionOpen() {
        if (this.connection) {
            if (this.connection.open) {
                console.log('connection still open')
                return
            } else {
                this.connection.close()
            }
        }

        console.log('connecting to ', remotePeerId)
        await this.onreconnecting('Extension')

        const startTime = Date.now()
        this.connection = await createConnection({
            peer: this.peer,
            remotePeerId: this.remotePeerId
        })
        console.log(`connected to extension (took ${Date.now() - startTime}ms)`)

        this.connection.on('data', (data) => {
            console.log('got data', data)
            this.onmessage(data)
        })
        this.connection.on('close', async () => {
            console.warn('peer connection closed')
            this.connection = null

            if (this.mode === WEBRTC_MODE) {
                return this.reconnect()
            }
        })
        this.connection.on('error', async (err) => {
            console.error('peer connection error', err)
            this.connection = null

            if (this.mode === WEBRTC_MODE) {
                return this.reconnect(err)
            }
        })
    }

    async _connectPubSub() {
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                console.log('websocket already connected')
                return
            }
            if (this.mode === WEBSOCKET_MODE) {
                this.onreconnecting('Server')
            }
            // Note: we don't use the ws.reconnect method
            // because it seems slower than just creating the ws again
            console.log('closing old websocket and creating a new one')
            this.ws.onclose = () => { }
            this.ws.onerror = () => { }
            this.ws.onopen = () => { }
            this.ws.onmessage = () => { }
            this.ws.close()
        }

        return new Promise((resolve, reject) => {
            const url = `${SUBSCRIBE_URL_BASE}${this.remotePeerId}/browser`
            console.log('connecting to:', url)
            let startTime = Date.now()
            let openTime
            if (typeof ReconnectingWebSocket === 'function') {
                console.log('Using ReconnectingWebSocket')
                this.ws = new ReconnectingWebSocket(url, [], {
                    minReconnectDelay: RECONNECT_BACKOFF,
                    maxRetries: MAX_RECONNECT_ATTEMPTS,
                    debug: true
                })
            } else {
                console.warn('ReconnectingWebSocket not found, using normal WebSocket')
                this.ws = new WebSocket(url)
            }
            this.ws.binaryType = 'arraybuffer'

            this.ws.onopen = () => {
                openTime = Date.now()
                console.log(`websocket open (took ${Date.now() - startTime}ms)`)

                // We only consider it connected when we get a message from the extension
                if (this.mode === WEBSOCKET_MODE) {
                    this.onreconnecting('Extension')
                }
                this.sendMessage({ type: 'connect' })
            }
            this.ws.onclose = (event) => {
                const reason = event ? event.reason : ''
                if (openTime) {
                    console.warn(`websocket closed (after ${Date.now() - openTime}ms). reason: ${reason}`)
                } else {
                    console.warn(`websocket closed. reason: ${reason}`)
                }
                startTime = Date.now()
                if (this.mode === WEBSOCKET_MODE) {
                    if (typeof ReconnectingWebSocket === 'function') {
                        this.onreconnecting('Server')
                    } else {
                        this.onerror(new Error(`WebSocket closed (reason: ${reason || 'unknown'})`))
                    }
                }
            }
            this.ws.onerror = (event) => {
                let err
                if (event instanceof Error) {
                    err = event
                } else if (typeof event === 'object') {
                    if (event.error) {
                        err = event.error
                    } else if (event.message) {
                        err = new Error(`WebSocket Error: ${event.message}`)
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

                // Only call reconnect if ReconnectingWebSocket isn't already trying to reconnect
                if (this.ws.readyState !== WebSocket.CONNECTING && this.mode === WEBSOCKET_MODE) {
                    this.reconnect(err)
                }

                reject(err)
            }
            this.ws.onmessage = async ({ data }) => {
                if (this.mode !== WEBSOCKET_MODE) {
                    console.warn('got websocket message when not in websocket mode', data)
                    return
                }
                try {
                    const message = await decrypt(this.encryptionKey, data)
                    resolve()
                    this.onmessage(message)
                } catch (err) {
                    console.error('got invalid message from pubsub', err)
                }
            }
        })
    }
}

async function getIceServers() {
    try {
        const response = await fetch('https://nts.turbovpb.com/ice')
        // WebRTC is slow with more than 2 ICE servers
        const iceServers = (await response.json()).slice(0, 2)
        console.log('using ICE servers:', iceServers)
        return iceServers
    } catch (err) {
        console.error('error getting ice servers', err)
        return DEFAULT_ICE_SERVERS
    }
}

async function createPeer({ iceServers, debugMode }) {
    return new Promise((resolve, reject) => {
        const peer = new Peer({
            host: 'peerjs.turbovpb.com',
            secure: true,
            debug: debugMode ? 2 : 1,
            config: {
                iceServers
            }
        })

        peer.on('error', (err) => console.error(`peer error (type: ${err.type})`, err))
        peer.on('disconnect', () => console.warn('peer disconnected'))

        peer.once('open', () => resolve(peer))
        peer.once('error', reject)
        peer.once('disconnect', () => reject(new Error('Peer disconnected')))

        setTimeout(() => reject(new Error('Connection timed out while trying to reach peer server')), 10000)
    })
}

async function createConnection({ peer, remotePeerId }) {
    return new Promise((resolve, reject) => {
        const conn = peer.connect(remotePeerId, {
            serialization: 'json'
        })

        conn.on('error', (err) => console.error('connection error', err))
        conn.on('close', () => console.warn('connection closed'))

        conn.once('open', () => resolve(conn))
        conn.once('error', reject)
        conn.once('close', () => reject(new Error('Connection closed')))

        setTimeout(() => reject(new Error('Connection timed out while trying to connect to extension')), 10000)
    })
}

async function importKey(base64) {
    if (!crypto || !crypto.subtle || typeof crypto.subtle.importKey !== 'function') {
        throw new Error('SubtleCrypto API is not supported')
    }
    const buffer = decodeBase64Url(base64)
    return crypto.subtle.importKey('raw', buffer, {
        name: ENCRYPTION_ALGORITHM
    }, true, ['encrypt', 'decrypt'])
}

async function encrypt(encryptionKey, message) {
    if (typeof message === 'object') {
        message = JSON.stringify(message)
    }
    const buffer = (new TextEncoder()).encode(message)
    const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTE_LENGTH))
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
        name: 'AES-GCM',
        iv
    }, encryptionKey, buffer))
    const payload = new Uint8Array(ciphertext.byteLength + ENCRYPTION_IV_BYTE_LENGTH)
    payload.set(ciphertext, 0)
    payload.set(iv, ciphertext.byteLength)
    return payload
}

async function decrypt(encryptionKey, arrayBuffer) {
    const payload = new Uint8Array(arrayBuffer)
    const ciphertext = payload.slice(0, 0 - ENCRYPTION_IV_BYTE_LENGTH)
    const iv = payload.slice(0 - ENCRYPTION_IV_BYTE_LENGTH)
    const plaintext = await crypto.subtle.decrypt({
        name: 'AES-GCM',
        iv
    }, encryptionKey, ciphertext)
    const string = (new TextDecoder()).decode(plaintext)
    return JSON.parse(string)
}

// Based on https://github.com/herrjemand/Base64URL-ArrayBuffer/blob/master/lib/base64url-arraybuffer.js
function decodeBase64Url(base64) {
    base64 = base64.replace(/[=]+$/, '')

    let bufferLength = base64.length * 0.75
    const arraybuffer = new ArrayBuffer(bufferLength)
    const bytes = new Uint8Array(arraybuffer)

    let p = 0
    let encoded1, encoded2, encoded3, encoded4
    for (let i = 0; i < base64.length; i += 4) {
        encoded1 = BASE64_URL_LOOKUP[base64.charCodeAt(i)]
        encoded2 = BASE64_URL_LOOKUP[base64.charCodeAt(i + 1)]
        encoded3 = BASE64_URL_LOOKUP[base64.charCodeAt(i + 2)]
        encoded4 = BASE64_URL_LOOKUP[base64.charCodeAt(i + 3)]

        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63)
    }

    return arraybuffer
}

async function wrapWithTracingSpan(span, spanName, promise) {
    if (!span) {
        if (typeof promise === 'function') {
            return (promise)()
        } else {
            return promise
        }
    }

    const child = span.startChild({ op: spanName })
    if (typeof promise === 'function') {
        await (promise)()
    } else {
        await promise
    }
    child.finish()
}