const RECONNECT_TIMEOUT = 3000

let iceServers = [{
    "url": "stun:stun.l.google.com:19302",
    "urls": "stun:stun.l.google.com:19302"
}, {
    "url": "stun:global.stun.twilio.com:3478?transport=udp",
    "urls": "stun:global.stun.twilio.com:3478?transport=udp"
}]
const PUBLISH_URL_BASE = 'https://pubsub.turbovpb.com/c/'
const SUBSCRIBE_URL_BASE = 'wss://pubsub.turbovpb.com/c/'
const WEBRTC_MODE = 'webrtc'
const WEBSOCKET_MODE = 'websocket'

class PeerConnection {
    constructor() {
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

        // this.mode = WEBRTC_MODE
        this.mode = WEBSOCKET_MODE
        this.ws = null
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
        } else {
            // Try reconnecting
            const reconnected = await new Promise((resolve) => {
                this.peer.once('open', () => resolve(true))
                this.peer.once('close', () => resolve(false))
                this.peer.once('error', () => resolve(false))
                this.peer.once('disconnected', () => resolve(false))

                setTimeout(() => resolve(false), RECONNECT_TIMEOUT)

                this.peer.reconnect()
            })
            if (reconnected) {
                console.log('reconnected existing peer')
                return
            } else {
                console.warn('unable to reconnect peer, destroying and creating a new one')
                this.peer.destroy()
                this.peer.connect()
            }
        }
    }

    getConnectionSecret() {
        return this.peerId
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
            return Promise.all([
                fetch(`${PUBLISH_URL_BASE}${this.sessionId}/exentsion`, { method: 'DELETE' }),
                fetch(`${PUBLISH_URL_BASE}${this.sessionId}/browser`, { method: 'DELETE' })
            ])
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
            if (this.isConnected()) {
                this.ws.send(JSON.stringify(message))
            } else {
                await fetch(`${PUBLISH_URL_BASE}${this.sessionId}/extension`, {
                    method: 'POST',
                    body: JSON.stringify(message)
                })
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
            const url = `${SUBSCRIBE_URL_BASE}${this.sessionId}/extension`
            console.log('connecting to:', url)
            this.ws = new ReconnectingWebSocket(url)
            const startTime = Date.now()
            this.ws.onopen = () => {
                console.log(`websocket open (took ${Date.now() - startTime}ms)`)
                if (this.mode === WEBSOCKET_MODE) {
                    this.onconnect()
                }
                resolve()
            }
            this.ws.onclose = () => {
                console.log('websocket closed')
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
            this.ws.onmessage = ({ data }) => {
                // The mobile site will determine which mode to use
                if (this.mode !== WEBSOCKET_MODE) {
                    console.log('switching to websocket mode')
                    this.mode = WEBSOCKET_MODE
                    this.onconnect()
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
