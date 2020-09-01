const DEFAULT_ICE_SERVERS = [{
    "url": "stun:stun.l.google.com:19302",
    "urls": "stun:stun.l.google.com:19302"
}, {
    "url": "stun:global.stun.twilio.com:3478?transport=udp",
    "urls": "stun:global.stun.twilio.com:3478?transport=udp"
}]

class PeerManager {
    constructor({ debugMode, remotePeerId }) {
        this.debugMode = debugMode
        this.remotePeerId = remotePeerId
        this.iceServers = null

        this.active = false
        this.peer = null
        this.connection = null
        this.isConnecting = false

        this.onData = () => { }
        this.onConnect = () => { }
        this.onError = () => { }
        this.onReconnecting = () => { }
    }

    async reconnect() {
        if (!this.active) {
            return
        }
        return this.connect()
    }

    async connect() {
        this.active = true

        // Don't connect again while we're in the middle of connecting
        if (this.isConnecting) {
            return
        }
        this.isConnecting = true

        if (!this.iceServers) {
            this.iceServers = await getIceServers()
        }

        await this.checkPeerConnected()
        await this.checkConnectionOpen()

        this.onConnect()
        this.isConnecting = false
    }

    async checkPeerConnected() {
        if (this.peer) {
            if (!this.peer.destroyed && !this.peer.disconnected) {
                console.log('peer is still connected')
                return
            }
            console.log('peer was not connected, destroying the old one')
            this.peer.destroy()
        }
        await this.onReconnecting()

        console.log('creating new peer')
        try {
            this.peer = await createPeer({
                iceServers: this.iceServers,
                debugMode: this.debugMode
            })
        } catch (err) {
            console.error('error creating peer')
            return this.onError(err)
        }
        console.log('peer connected to server')

        this.peer.on('error', async (err) => {
            console.error(`peer error (type: ${err.type})`, err)
            this.closeConnection()
            // If stop is called in the onError handler, we won't reconnect
            await this.onError(err)
            await this.reconnect()
        })
        this.peer.on('disconnect', async () => {
            console.warn('peer disconnected')
            this.closeConnection()
            await this.onReconnecting()
            await this.reconnect()
        })
    }

    closeConnection() {
        if (this.connection) {
            this.connection.close()
            this.connection = null
        }
    }

    async checkConnectionOpen() {
        if (!this.connection || !this.connection.open) {
            if (this.connection) {
                this.connection.close()
            }

            console.log('connecting to ', remotePeerId)
            try {
                this.connection = await createConnection({
                    peer: this.peer,
                    remotePeerId: this.remotePeerId
                })
            } catch (err) {
                console.error('error creating connection', err)
                return this.onError(err)
            }
            console.log('connected to extension')

            this.connection.on('data', (data) => {
                console.log('got data', data)
                this.onData(data)
            })
            this.connection.on('close', async () => {
                console.warn('connection closed')
                this.connection = null
                await this.onReconnecting()
                await this.reconnect()
            })
            this.connection.on('error', async (err) => {
                console.error('connection error', err)
                this.connection = null
                await this.onError(err)
                await this.reconnect()
            })
        }
    }

    stop() {
        console.log('stopping peer manager')
        this.active = false
        if (this.peer) {
            this.peer.destroy()
        }
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
        log('error getting ice servers', err)
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
        peer.once('open', () => resolve(peer))
        peer.once('error', reject)
        peer.once('disconnect', () => reject(new Error('Peer disconnected')))
    })
}

async function createConnection({ peer, remotePeerId }) {
    return new Promise((resolve, reject) => {
        const conn = peer.connect(remotePeerId, {
            serialization: 'json'
        })
        conn.once('open', () => resolve(conn))
        conn.once('error', reject)
        conn.once('close', () => reject(new Error('Connection closed')))
    })
}