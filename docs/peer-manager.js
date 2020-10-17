console.log('Loading PeerManager')

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

        this.isConnecting = false
        this.reconnectDelay = RECONNECT_DELAY_START
        this.reconnectAttempts = 0
        this.reconnectResolves = []
    }

    async reconnect(err, immediate) {
        if (this.active === false) {
            console.warn('The PeerManager was already stopped, not reconnecting')
            return
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
            return this.onError(err || new Error('Exceeded maximum number of reconnect attempts'))
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

        if (!this.iceServers) {
            this.iceServers = await getIceServers()
        }

        try {
            await this.checkPeerConnected()
            await this.checkConnectionOpen()
        } catch (err) {
            this.isConnecting = false
            return this.reconnect(err)
        }

        this.isConnecting = false
        await this.onConnect()

        // Resolve all of the reconnect calls that were
        // called while we were already reconnecting
        let resolve
        while (resolve = this.reconnectResolves.pop()) {
            resolve()
        }
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

        console.log('creating new peer')
        await this.onReconnecting('Server')

        const startTime = Date.now()
        this.peer = await createPeer({
            iceServers: this.iceServers,
            debugMode: this.debugMode
        })
        console.log(`peer connected to server (took ${Date.now() - startTime}ms)`)

        this.peer.on('error', async (err) => {
            this.closeConnection()
            return this.reconnect(err)
        })
        this.peer.on('disconnect', async () => {
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
        await this.onReconnecting('Extension')

        const startTime = Date.now()
        this.connection = await createConnection({
            peer: this.peer,
            remotePeerId: this.remotePeerId
        })
        console.log(`connected to extension (took ${Date.now() - startTime}ms)`)

        this.connection.on('data', (data) => {
            console.log('got data', data)
            this.onData(data)
        })
        this.connection.on('close', async () => {
            this.connection = null
            await this.onReconnecting()
            return this.reconnect()
        })
        this.connection.on('error', async (err) => {
            this.connection = null
            return this.reconnect()
        })
    }

    async sendMessage(message) {
        if (this.active === false) {
            // TODO maybe it's better to throw an error here?
            console.error('Not sending message because PeerManager has already been stopped')
            return
        }
        console.log('sending message', message)
        if (this.connection && this.connection.open) {
            this.connection.send(message)
        } else {
            console.log('trying to send message but connection is not open, reconnecting first')
            await this.reconnect()
            this.connection.send(message)
        }
    }

    stop() {
        console.log('stopping peer manager')
        this.active = false
        if (this.peer) {
            this.peer.destroy()
        }
    }

    isStopped() {
        return !this.active
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
