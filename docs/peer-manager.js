const DEFAULT_ICE_SERVERS = [{
    "url": "stun:stun.l.google.com:19302",
    "urls": "stun:stun.l.google.com:19302"
}, {
    "url": "stun:global.stun.twilio.com:3478?transport=udp",
    "urls": "stun:global.stun.twilio.com:3478?transport=udp"
}]
const RECONNECT_BACKOFF = 5
const RECONNECT_DELAY_START = 50
const MAX_RECONNECT_ATTEMPTS = 3

class PeerManager {
    constructor({ debugMode, remotePeerId }) {
        this.debugMode = debugMode
        this.remotePeerId = remotePeerId
        this.iceServers = null

        this.active = false
        this.peer = null
        this.connection = null

        this.onData = () => { }
        this.onConnect = () => { }
        this.onError = () => { }
        this.onReconnecting = () => { }

        this.reconnectDelay = RECONNECT_DELAY_START
        this.reconnectAttempts = 0
        this.reconnectTimeout = null
    }

    async reconnect(err) {
        if (this.active === false) {
            console.log('not reconnecting because the peer manager is off')
            return
        }

        if (this.reconnectTimeout) {
            console.log('already reconnecting')
            return
        }

        if (++this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            console.error('exceeded max number of reconnect attempts')
            return this.onError(err || new Error('Exceeded maximum number of reconnect attempts'))
        }

        console.log(`waiting ${this.reconnectDelay}ms before reconnecting`)
        await new Promise((resolve) => {
            this.reconnectTimeout = setTimeout(() => {
                this.reconnectTimeout = null
                this.reconnectDelay = this.reconnectDelay * RECONNECT_BACKOFF
                resolve()
            }, this.reconnectDelay)
        })
        try {
            await this.connect()
            this.reconnectDelay = RECONNECT_DELAY_START
            this.reconnectAttempts = 0
        } catch (err) {
            return this.onError(err)
        }
    }

    async connect() {
        this.active = true
        console.log('connecting')

        if (!this.iceServers) {
            this.iceServers = await getIceServers()
        }

        await this.checkPeerConnected()
        await this.checkConnectionOpen()

        return this.onConnect()
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
        const startTime = Date.now()
        try {
            this.peer = await createPeer({
                iceServers: this.iceServers,
                debugMode: this.debugMode
            })
        } catch (err) {
            console.error('error creating peer')
            return this.reconnect(err)
        }
        console.log(`peer connected to server (took ${Date.now() - startTime}ms)`)

        this.peer.on('error', async (err) => {
            console.error(`peer error (type: ${err.type})`, err)
            this.closeConnection()
            return this.reconnect(err)
        })
        this.peer.on('disconnect', async () => {
            console.warn('peer disconnected')
            this.closeConnection()
            await this.onReconnecting()
            return this.reconnect()
        })
    }

    closeConnection() {
        if (this.connection) {
            this.connection.close()
            this.connection = null
        }
    }

    async checkConnectionOpen() {
        if (this.connection) {
            if (this.connection.open) {
                console.log('connection still open')
                return
            } else {
                this.connection.close()
            }
        }

        console.log('connecting to ', remotePeerId)
        const startTime = Date.now()
        try {
            this.connection = await createConnection({
                peer: this.peer,
                remotePeerId: this.remotePeerId
            })
        } catch (err) {
            console.error('error creating connection', err)
            return this.reconnect(err)
        }
        console.log(`connected to extension (took ${Date.now() - startTime}ms)`)

        this.connection.on('data', (data) => {
            console.log('got data', data)
            this.onData(data)
        })
        this.connection.on('close', async () => {
            console.warn('connection closed')
            this.connection = null
            await this.onReconnecting()
            return this.reconnect()
        })
        this.connection.on('error', async (err) => {
            console.error('connection error', err)
            this.connection = null
            return this.reconnect()
        })
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
