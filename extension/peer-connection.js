let iceServers = [{
    "url": "stun:stun.l.google.com:19302",
    "urls": "stun:stun.l.google.com:19302"
}, {
    "url": "stun:global.stun.twilio.com:3478?transport=udp",
    "urls": "stun:global.stun.twilio.com:3478?transport=udp"
}]

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
    }

    async connect() {
        if (!this.peer && !this.connecting) {
            this.connecting = true
            await this._createPeer()
            this.connecting = false
        }
    }

    getConnectionSecret() {
        return this.peerId
    }

    getSessionId() {
        return this.sessionId
    }

    destroy() {
        this.peer.destroy()
    }

    sendMessage(message) {
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
    }

    isConnected() {
        return this._getOpenConnections().length > 0
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
}
