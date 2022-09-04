const RECONNECT_TIMEOUT = 3000

let iceServers = [{
    "url": "stun:stun.l.google.com:19302",
    "urls": "stun:stun.l.google.com:19302"
}, {
    "url": "stun:global.stun.twilio.com:3478?transport=udp",
    "urls": "stun:global.stun.twilio.com:3478?transport=udp"
}]
const DEFAULT_SERVER_URL = 'https://turbovpb.com'
const WEBRTC_MODE = 'webrtc'
const WEBSOCKET_MODE = 'websocket'

const ENCRYPTION_KEY_LENGTH = 256
const ENCRYPTION_IV_BYTE_LENGTH = 12
const ENCRYPTION_ALGORITHM = 'AES-GCM'
const BASE64_URL_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

class PeerConnection {
    constructor(encryptionKey, url = DEFAULT_SERVER_URL) {
        this.encryptionKey = encryptionKey
        this.url = new URL('/api/channels/', url).toString()

        // Create Peer ID
        const array = new Uint8Array(16)
        crypto.getRandomValues(array)
        this.peerId = [...array].map(byte => byte.toString(16).padStart(2, '0')).join('')

        // Create Session ID
        crypto.getRandomValues(array)
        this.sessionId = [...array].map(byte => byte.toString(16).padStart(2, '0')).join('')

        this.peer = null
        this.connections = []
        this.connecting = false

        this.onconnect = () => { }
        this.ondisconnect = () => { }
        this.onerror = () => { }
        this.onmessage = () => { }

        this.mode = WEBRTC_MODE
        this.ws = null
    }

    static async create(url) {
        const encryptionKey = await generateKey()
        return new PeerConnection(encryptionKey, url)
    }

    async connect() {
        if (this.connecting) {
            return
        }
        this.connecting = true
        await this._createPeer()
        await this._connectPubSub()
        this.connecting = false
    }

    async reconnect() {
        if (!this.peer && !this.ws) {
            return this.connect()
        }

        if (this.peer.disconnected === false) {
            console.log('peer already connected')
            return
        } else if (!this.peer.destroyed) {
            // Try reconnecting
            const reconnected = await new Promise((resolve) => {
                this.peer.once('open', () => resolve(true))
                this.peer.once('close', () => resolve(false))
                this.peer.once('error', () => resolve(false))
                this.peer.once('disconnected', () => resolve(false))

                setTimeout(() => resolve(false), RECONNECT_TIMEOUT)

                try {
                    this.peer.reconnect()
                } catch (err) {
                    resolve(false)
                }
            })
            if (reconnected) {
                console.log('reconnected existing peer')
                return
            } else {
                console.warn('unable to reconnect peer, destroying and creating a new one')
                this.peer.destroy()
            }
        }
        this.peer.connect()
    }

    async getConnectionSecret() {
        const exported = await exportKey(this.encryptionKey)
        return `${this.peerId}&${exported}`
    }

    getSessionId() {
        return this.sessionId
    }

    async destroy() {
        console.log('destroying peer connection')
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

        try {
            await fetch(`${this.url}${this.sessionId}`, { method: 'DELETE' })
        } catch (err) {
            console.error('error deleting channels', err)
        }
    }

    async sendMessage(message) {
        if (this.mode === WEBRTC_MODE) {
            const connectedPeers = this._getOpenConnections()
            console.log(`sending message to ${connectedPeers.length} peer(s)`)
            if (connectedPeers.length === 0) {
                console.log('not sending message because there is no open connection for peer', this.peerId)
                return
            }
            for (let conn of connectedPeers) {
                if (conn.open) {
                    conn.send(message)
                } else {
                    conn.once('open', () => {
                        conn.send(message)
                    })
                }
            }
        } else {
            const encrypted = await encrypt(this.encryptionKey, message)
            if (this.isConnected()) {
                console.log('sending message to pubsub via websocket')
                this.ws.send(encrypted)
            } else {
                console.log('sending message to pubsub via HTTP POST')
                try {
                    await fetch(`${this.url}${this.sessionId}/extension`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/octet-stream'
                        },
                        body: encrypted
                    })
                } catch (err) {
                    console.error('error sending message to pubsub', err)
                    // This will queue the message to be sent when the websocket opens
                    this.ws.send(encrypted)
                }
            }
        }
    }

    isConnected() {
        if (this.mode === WEBRTC_MODE) {
            return this._getOpenConnections().length > 0
        } else {
            return this.ws && this.ws.readyState === WebSocket.OPEN
        }
    }

    _getOpenConnections() {
        return this.connections.filter(conn => {
            return conn && conn.peerConnection && conn.peerConnection.iceConnectionState === 'connected'
        })
    }

    async _createPeer() {
        if (typeof window.Peer === 'undefined') {
            console.warn('peerjs not found, falling back to websocket mode')
            return
        }
        try {
            // The response will be cached so we'll only request it once every 12 hours
            const res = await fetch('https://nts.turbovpb.com/ice')
            iceServers = await res.json()
            iceServers = iceServers.slice(0, 2)
            console.log('using ice servers', iceServers)
        } catch (err) {
            console.warn('unable to fetch ice servers', err)
        }
        const peer = new Peer(this.peerId, {
            host: 'peerjs.turbovpb.com',
            path: '/',
            secure: true,
            debug: 1,
            pingInterval: 1000,
            config: {
                iceServers
            }
        })
        this.peer = peer

        peer.on('open', () => console.log(`peer ${this.peerId} listening for connections`))
        peer.on('error', (err) => {
            console.error(err)
            this.onerror(err)
        })
        peer.on('close', () => {
            console.log(`peer ${this.peerId} closed`)
            this.onerror(new Error('Peer closed'))
        })

        peer.on('connection', async (conn) => {
            this.connections.push(conn)
            const connIndex = this.connections.length - 1
            console.log(`peer ${this.peerId} got connection ${connIndex}`)
            conn.on('close', () => {
                console.log(`peer ${this.peerId} connection ${connIndex} closed`)
                delete this.connections[connIndex]
            })
            conn.on('iceStateChanged', async (state) => {
                console.log(`peer ${this.peerId} connection ${connIndex} state: ${state}`)
                // TODO if the state is disconnected, should we let the content script know it's disconnected?
                if (this.isConnected()) {
                    if (this.mode !== WEBRTC_MODE) {
                        console.log('switching to webrtc mode')
                        this.mode = WEBRTC_MODE
                    }
                    this.onconnect()
                } else {
                    this.ondisconnect()
                }
            })
            conn.on('error', (err) => {
                console.log(`peer ${this.peerId} connection ${connIndex} error`, err)
                delete this.connections[connIndex]
            })
            if (conn.serialization === 'json') {
                conn.on('data', (message) => {
                    this.onmessage(message)
                })
            } else {
                console.warn(`Peer connection for peerId ${peerId} serialization should be json but it is: ${conn.serialization}`)
                this.onerror(new Error(`Peer using unexpected serialization format: ${conn.serialization}`))
            }
        })
    }

    async _connectPubSub() {
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                console.log('websocket already connected')
                return
            }
            this.ws.onclose = () => { }
            this.ws.onerror = () => { }
            this.ws.onopen = () => { }
            this.ws.onmessage = () => { }
            this.ws.close()
        }

        return new Promise((resolve, reject) => {
            const url = `${this.url.replace('http', 'ws')}${this.peerId}/extension`
            console.log('connecting to:', url)
            this.ws = new ReconnectingWebSocket(url, [], {
                minReconnectionDelay: 50,
                maxReconnectionDelay: 1000,
                connectionTimeout: 2000,
                debug: true
            })
            this.ws.binaryType = 'arraybuffer'
            let startTime = Date.now()
            let openTime
            this.ws.onopen = () => {
                console.log(`websocket open (took ${Date.now() - startTime}ms)`)
                openTime = Date.now()
                resolve()
            }
            this.ws.onclose = () => {
                console.log('websocket closed', openTime ? `(after ${Date.now() - openTime}ms)` : '')
                startTime = Date.now()
                if (this.mode === WEBSOCKET_MODE) {
                    this.ondisconnect()
                }
                reject(new Error('Websocket closed before it was opened'))
            }
            this.ws.onerror = ({ error, message }) => {
                if (!error) {
                    error = new Error(`WebSocket Error: ${message}`)
                }
                if (this.mode === WEBSOCKET_MODE) {
                    this.onerror(error)
                } else {
                    console.error('websocket error:', error)
                }
                reject(error)
            }
            this.ws.onmessage = async ({ data }) => {
                // The mobile site will determine which mode to use
                if (this.mode !== WEBSOCKET_MODE) {
                    console.log('switching to websocket mode')
                    this.mode = WEBSOCKET_MODE
                }
                try {
                    const message = await decrypt(this.encryptionKey, data)
                    this.onconnect()
                    this.onmessage(message)
                } catch (err) {
                    console.error('got invalid message from pubsub', err)
                }
            }
        })
    }
}

async function generateKey() {
    if (!crypto || !crypto.subtle) {
        throw new Error(`SubtleCrypto API is required to generate key`)
    }

    return crypto.subtle.generateKey({
        name: ENCRYPTION_ALGORITHM,
        length: ENCRYPTION_KEY_LENGTH
    }, true, ['encrypt', 'decrypt'])
}

async function exportKey(key) {
    const buffer = await crypto.subtle.exportKey('raw', key)
    return encodeBase64Url(buffer)
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
function encodeBase64Url(arraybuffer) {
    const bytes = new Uint8Array(arraybuffer)
    let base64 = ''

    for (let i = 0; i < bytes.length; i += 3) {
        base64 += BASE64_URL_CHARACTERS[bytes[i] >> 2]
        base64 += BASE64_URL_CHARACTERS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)]
        base64 += BASE64_URL_CHARACTERS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)]
        base64 += BASE64_URL_CHARACTERS[bytes[i + 2] & 63]
    }

    if ((bytes.length % 3) === 2) {
        base64 = base64.substring(0, base64.length - 1)
    } else if (bytes.length % 3 === 1) {
        base64 = base64.substring(0, base64.length - 2)
    }

    return base64
}
