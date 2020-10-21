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
const MAX_RECONNECT_ATTEMPTS = 3

const PUBLISH_URL_BASE = 'https://pubsub.turbovpb.com/c/'
const SUBSCRIBE_URL_BASE = 'wss://pubsub.turbovpb.com/c/'
const WEBRTC_MODE = 'webrtc'
const WEBSOCKET_MODE = 'websocket'

class PeerManager {
    constructor({ debugMode, remotePeerId, sessionId }) {
        this.debugMode = debugMode
        this.remotePeerId = remotePeerId
        this.sessionId = sessionId
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

        this.mode = WEBRTC_MODE
        this.ws = null
    }

    async reconnect(err, immediate) {
        if (this.active === false) {
            console.warn('The PeerManager was already stopped, not reconnecting')
            return
        }

        if (this.mode === WEBSOCKET_MODE) {
            return this._connectPubSub()
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

        if (++this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            console.error('exceeded max number of reconnect attempts')
            console.log('switching to websocket mode')
            this.mode = WEBSOCKET_MODE
            return this.connect()
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

    async connect() {
        this.active = true
        this.isConnecting = true
        console.log('connecting')

        if (this.mode === WEBSOCKET_MODE) {
            await this._connectPubSub()
            this.isConnecting = false
            return
        }

        if (!this.iceServers) {
            this.iceServers = await getIceServers()
        }

        try {
            await this._checkPeerConnected()
            await this._checkConnectionOpen()
        } catch (err) {
            this.isConnecting = false
            return this.reconnect(err)
        }

        this.isConnecting = false
        await this.onconnect()

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
            this.ws.send(JSON.stringify(message))
        }
    }

    stop() {
        console.log('stopping peer manager')
        this.active = false
        if (this.peer) {
            this.peer.destroy()
        }
        if (this.ws) {
            this.ws.close()
        }
    }

    isStopped() {
        return !this.active
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
            this._closeConnection()
            return this.reconnect(err)
        })
        this.peer.on('disconnect', async () => {
            this._closeConnection()
            await this.onreconnecting()
            return this.reconnect()
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
            this.connection = null
            await this.onreconnecting()
            return this.reconnect()
        })
        this.connection.on('error', async (err) => {
            this.connection = null
            return this.reconnect()
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
            const url = `${SUBSCRIBE_URL_BASE}${this.sessionId}/browser`
            console.log('connecting to:', url)
            this.ws = new WebSocket(url)
            this.ws.onopen = () => {
                console.log('websocket open')
                if (this.mode === WEBSOCKET_MODE) {
                    this.onconnect()
                }
                this.sendMessage({ type: 'connect' })
                resolve()
            }
            this.ws.onclose = () => {
                console.log('websocket closed')
                if (this.mode === WEBSOCKET_MODE) {
                    // TODO reconnect
                    this.onerror(new Error('WebSocket closed'))
                }
                reject(new Error('Websocket closed before it was opened'))
            }
            this.ws.onerror = ({ message }) => {
                const err = new Error(`WebSocket Error: ${message}`)
                if (this.mode === WEBSOCKET_MODE) {
                    this.onerror(err)
                } else {
                    console.error('websocket error:', err)
                }
                reject(error)
            }
            this.ws.onmessage = ({ data }) => {
                if (this.mode !== WEBSOCKET_MODE) {
                    console.warn('got websocket message when not in websocket mode', data)
                    return
                }
                try {
                    const message = JSON.parse(data)
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
