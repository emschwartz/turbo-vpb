const peers = {}
const unregisterContentScripts = {}

const OPENVPB_REGEX = /https\:\/\/(www\.)?openvpb\.com/i
const EVERYACTION_REGEX = /https\:\/\/.*\.(everyaction|ngpvan)\.com/i
const VOTEBUILDER_REGEX = /https\:\/\/(www\.)?votebuilder.com/i
const BLUEVOTE_REGEX = /https\:\/\/.*\.bluevote.com/i

const EVERYACTION_ORIGIN = 'https://*.everyaction.com/ContactDetailScript*'
const VOTEBUILDER_ORIGIN = 'https://www.votebuilder.com/ContactDetailScript*'
const BLUEVOTE_ORIGIN = 'https://phonebank.bluevote.com/*'
const OPENVPB_ORIGIN = 'https://www.openvpb.com/VirtualPhoneBank*'

browser.runtime.onMessage.addListener(async (message, sender) => {
    if (typeof message !== 'object') {
        console.log('got message that was not an object', message)
        return
    }

    if (message.type === 'connect') {
        const peerId = message.peerId
        await createPeer(peerId, sender.tab.id)
        const openConnections = peers[peerId].connections.filter(conn => conn && conn.peerConnection && conn.peerConnection.iceConnectionState === 'connected')

        // If the page reloaded, it will send a connect request.
        // Tell it if there were already connected peers so it can correctly display the status
        if (openConnections.length > 0) {
            console.log('letting tab know there is still open connection')
            await browser.tabs.sendMessage(sender.tab.id, {
                type: 'peerConnected'
            })
        }
    } else if (message.type === 'contact') {
        const peerId = message.peerId
        await createPeer(peerId, sender.tab.id)
        console.log('sending contact to peer', peerId)
        const data = message.data
        data.type = 'contact'
        sendMessage(peerId, data)
    } else {
        console.log('got unexpected message', message)
    }
})

browser.tabs.onRemoved.addListener(async (tabId) => {
    for (let peerId in peers) {
        if (peers[peerId].tabId === tabId) {
            console.log(`sending disconnect message to peer: ${peerId}`)
            sendMessage(peerId, {
                type: 'disconnect'
            })
            // TODO only destroy peer after message has been flushed
            setTimeout(() => {
                console.log(`destroying peer ${peerId} because the tab was closed`)
                destroyPeer(peerId)
            }, 300)
        }
    }
})

async function createPeer(peerId, tabId) {
    if (peers[peerId] && !peers[peerId].destroyed && !peers[peerId].disconnected) {
        if (peers[peerId].tabId !== tabId) {
            console.log(`peer ${peerId} is now in tab ${tabId}`)
            peers[peerId].tabId = tabId
        }

        // TODO reconnect
        return
    }

    if (peers[peerId] && peers[peerId].peer === null) {
        // Duplicate request
        return
    }

    console.log(`creating peer ${peerId} for tab ${tabId}`)

    peers[peerId] = {
        peer: null,
        tabId,
        connections: []
    }

    let iceServers = [{
        "url": "stun:stun.l.google.com:19302",
        "urls": "stun:stun.l.google.com:19302"
    }, {
        "url": "stun:global.stun.twilio.com:3478?transport=udp",
        "urls": "stun:global.stun.twilio.com:3478?transport=udp"
    }]
    try {
        // The response will be cached so we'll only request it once every 12 hours
        const res = await fetch('https://nts.turbovpb.com/ice')
        iceServers = await res.json()
        iceServers = iceServers.slice(0, 2)
        console.log('using ice servers', iceServers)
    } catch (err) {
        console.warn('unable to fetch ice servers', err)
    }

    // Note that PeerJS peers are created in the background script instead
    // of in the content_script because loading the peerjs.js script as
    // part of the content_script caused an error. It complained about the
    // webrtc-adapter peerjs is using internally trying to set a read-only property
    const peer = new Peer(peerId, {
        host: 'peerjs.turbovpb.com',
        path: '/',
        secure: true,
        debug: 1,
        pingInterval: 1000,
        config: {
            iceServers
        }
    })
    peers[peerId].peer = peer

    peer.on('open', () => console.log(`peer ${peerId} listening for connections`))
    peer.on('error', (err) => {
        console.error(err)
        destroyPeer(peerId)
    })
    peer.on('close', () => {
        console.log(`peer ${peerId} closed`)
        destroyPeer(peerId)
    })

    peer.on('connection', async (conn) => {
        peers[peerId].connections.push(conn)
        const connIndex = peers[peerId].connections.length - 1
        console.log(`peer ${peerId} got connection ${connIndex}`)
        conn.on('close', () => {
            console.log(`peer ${peerId} connection ${connIndex} closed`)
            delete peers[peerId].connections[connIndex]
        })
        conn.on('iceStateChanged', async (state) => {
            console.log(`peer ${peerId} connection ${connIndex} state: ${state}`)
            // TODO if the state is disconnected, should we let the content script know it's disconnected?
            const openConnections = peers[peerId].connections.filter(conn => conn && conn.peerConnection && conn.peerConnection.iceConnectionState === 'connected')
            if (openConnections.length === 0) {
                await browser.tabs.sendMessage(peers[peerId].tabId, {
                    type: 'peerDisconnected'
                })
            } else {
                await browser.tabs.sendMessage(peers[peerId].tabId, {
                    type: 'peerConnected'
                })
            }
        })
        conn.on('error', (err) => {
            console.log(`peer ${peerId} connection ${connIndex} error`, err)
            delete peers[peerId].connections[connIndex]
        })
        if (conn.serialization === 'json') {
            conn.on('data', async (message) => {
                if (message.type === 'callResult') {
                    console.log(`peer ${peerId} connection ${connIndex} sent call result:`, message)
                    try {
                        await browser.tabs.sendMessage(peers[peerId].tabId, {
                            type: 'callResult',
                            result: message.result
                        })
                    } catch (err) {
                        console.error('Error sending call result to content_script', err)
                    }
                } else {
                    console.warn(`got unexpected message type from peer: ${message.type}`)
                }
            })
        } else {
            console.warn(`Peer connection for peerId ${peerId} serialization should be json but it is: ${conn.serialization}`)
            return destroyPeer(peerId)
        }
        try {
            console.log('requesting contact from content script')
            await browser.tabs.sendMessage(peers[peerId].tabId, {
                type: 'contactRequest'
            })
        } catch (err) {
            console.error('Error sending contact request to content_script', err)
            if (err.message === 'tab is null') {
                console.warn('destroying peer because tab was closed')
                destroyPeer(peerId)
            }
        }
    })
}

browser.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
    const { statsStartDate } = await browser.storage.local.get(['statsStartDate'])
    if (!statsStartDate) {
        console.log('setting stats start date')
        await browser.storage.local.set({ statsStartDate: (new Date()).toISOString() })
    }
})

browser.permissions.getAll()
    .then(async ({ origins = [] }) => {
        for (let origin of origins) {
            await enableOrigin(origin)
        }
    })

function getContentScripts(origin) {
    if (OPENVPB_REGEX.test(origin)) {
        originSpecificJs = { file: 'openvpb.js' }
    } else if (EVERYACTION_REGEX.test(origin) || VOTEBUILDER_REGEX.test(origin)) {
        originSpecificJs = { file: 'everyaction.js' }
    } else if (BLUEVOTE_REGEX.test(origin)) {
        originSpecificJs = { file: 'bluevote.js' }
    } else {
        console.error(`unknown origin ${origin}`)
        return
    }
    return [
        { file: 'dependencies/browser-polyfill.js' },
        { file: 'dependencies/tingle.js' },
        { file: 'dependencies/kjua.js' },
        { file: 'content.js' },
        originSpecificJs
    ]
}

async function enableOrigin(origin) {
    console.log(`registering content scripts for ${origin}`)
    try {
        const { unregister } = await browser.contentScripts.register({
            matches: [origin],
            js: getContentScripts(origin),
            css: [{ file: 'dependencies/tingle.css' }]
        })
        unregisterContentScripts[origin] = unregister
    } catch (err) {
        console.error(`error registering content script for ${origin}`, err)
    }
}

async function disableOrigin(origin) {
    if (typeof unregisterContentScripts[origin] === 'function') {
        (unregisterContentScripts[origin])()
        delete unregisterContentScripts[origin]
        console.log(`disabled content scripts for ${origin}`)
        return true
    } else {
        return false
    }
}

function destroyPeer(peerId) {
    if (peers[peerId]) {
        peers[peerId].peer.destroy()
        delete peers[peerId]
    } else {
        console.warn(`not destroying peer: ${peerId} because it was already destroyed or does not exist`)
    }
}

function sendMessage(peerId, message) {
    if (!peers[peerId] || peers[peerId].connections.length === 0) {
        console.log('not sending message because there is no open connection for peer', peerId)
        return
    }

    message.extensionVersion = browser.runtime.getManifest().version
    message.extensionUserAgent = navigator.userAgent
    message.extensionPlatform = navigator.platform
    const connectedPeers = peers[peerId].connections.filter((conn) => !!conn)
    console.log(`sending message to ${connectedPeers.length} peer(s)`)
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