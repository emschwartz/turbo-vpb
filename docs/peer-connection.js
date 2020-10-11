const PUBSUB_URL_BASE = 'wss://pubsub.turbovpb.com/c/'
const ENCRYPTION_KEY_LENGTH = 256
const ENCRYPTION_IV_BYTE_LENGTH = 12
const ENCRYPTION_ALGORITHM = 'AES-GCM'
const BASE64_URL_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const BASE64_URL_LOOKUP = new Uint8Array(256);
for (let i = 0; i < BASE64_URL_CHARACTERS.length; i++) {
    BASE64_URL_LOOKUP[BASE64_URL_CHARACTERS.charCodeAt(i)] = i;
}

class PeerConnection {
    constructor() {
        this.ws = null
        this.sessionId = null
        this.encryptionKey = null
        this.identity = null
        this.connecting = false
        this.connected = false
        this.destroyed = false

        this.onopen = () => { }
        this.onconnect = () => { }
        this.onclose = () => { }
        this.onconnecting = () => { }
        this.onerror = () => { }
        this.onmessage = () => { }
    }

    static async create({ sessionId, encryptionKey, wsOpts } = {}) {
        const connection = new PeerConnection()
        connection.wsOpts = wsOpts
        if (sessionId && encryptionKey) {
            connection.identity = 'browser'
            connection.sessionId = sessionId
            connection.encryptionKey = await importKey(encryptionKey)
        } else {
            connection.identity = 'extension'
            connection.sessionId = encodeBase64Url(crypto.getRandomValues(new Uint8Array(16)))
            connection.encryptionKey = await generateKey()
        }
        return connection
    }

    async connect() {
        return new Promise((resolve, reject) => {
            if (this.connecting || this.isConnected()) {
                console.log('peer already connected')
                return resolve()
            }

            this.connecting = true
            if (this.ws) {
                this.ws.close()
            }

            const pubsubUrl = `${PUBSUB_URL_BASE}${this.sessionId}/${this.identity}`
            console.log(`Connecting to ${pubsubUrl}`)
            this.ws = new ReconnectingWebSocket(pubsubUrl, [], this.wsOpts)
            this.ws.binaryType = 'arraybuffer'
            this.connecting = false

            this.ws.onopen = async () => {
                console.log('websocket open')
                this.connecting = false
                await this.sendMessage({
                    type: 'connect'
                })
                this.onopen()
            }
            this.ws.onclose = () => {
                console.log('websocket closed')
                this.connected = false
                // ReconnectingWebSocket will automatically reconnect
                this.onclose()
            }
            this.ws.onconnecting = () => {
                console.log('websocket reconnecting')
                this.onconnecting()
            }
            this.ws.onmessage = async ({ data }) => {
                let message
                try {
                    message = await decrypt(this.encryptionKey, data)
                } catch (err) {
                    console.error(`Error decrypting message from peer ${this.sessionId}`, err.message || err)
                    return
                }
                if (!this.connected) {
                    this.onconnect()
                    this.connected = true
                    resolve()
                }
                this.onmessage(message)
            }
            this.ws.onerror = (err) => {
                if (err && err.error) {
                    err = err.error
                }
                console.log('websocket error', err)
                this.connecting = false
                this.connected = false
                this.onerror(err)
                reject(err)
            }
        })
    }

    async getConnectionSecret() {
        return exportKey(this.encryptionKey)
    }

    getSessionId() {
        return this.sessionId
    }

    destroy() {
        this.destroyed = true
        this.ws.close()
    }

    async sendMessage(message) {
        const ciphertext = await encrypt(this.encryptionKey, message)
        this.ws.send(ciphertext)
    }

    isConnected() {
        return this.ws && this.ws.readyState === ReconnectingWebSocket.OPEN
    }

    isDestroyed() {
        return this.destroyed
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

async function importKey(base64) {
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
