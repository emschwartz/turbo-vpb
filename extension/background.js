const OPENVPB_REGEX = /https\:\/\/(www\.)?openvpb\.com/i
const EVERYACTION_REGEX = /https\:\/\/.*\.(everyaction|ngpvan)\.com/i
const VOTEBUILDER_REGEX = /https\:\/\/(www\.)?votebuilder.com/i
const BLUEVOTE_REGEX = /https\:\/\/.*\.bluevote.com/i
const STARTTHEVAN_REGEX = /https\:\/\/(www\.)?startthevan.com/i

const OPENVPB_ORIGIN = 'https://www.openvpb.com/VirtualPhoneBank*'
const EVERYACTION_ORIGIN = 'https://*.everyaction.com/ContactDetailScript*'
const VOTEBUILDER_ORIGIN = 'https://www.votebuilder.com/ContactDetailScript*'
const BLUEVOTE_ORIGIN = 'https://phonebank.bluevote.com/*'
const STARTTHEVAN_ORIGIN = 'https://www.startthevan.com/ContactDetailScript*'

const peers = {}
const unregisterContentScripts = {}

// Stored as:
//   sessionId -> [ timestamp, duration, result, textedTimestamp ]
const sessionRecords = {}
let totalCalls = 0
let totalTexts = 0
const TIMESTAMP_INDEX = 0
const DURATION_INDEX = 1
const RESULT_INDEX = 2
const TEXTED_TIMESTAMP_INDEX = 3
const RESULT_CODES = {
    Contacted: 1,
    NotContacted: 2,
    Texted: 3
}

// Load previously stored statistics
browser.storage.local.get(['sessionRecords', 'totalCalls', 'totalTexts'])
    .then((fromStorage) => {
        Object.assign(sessionRecords, fromStorage.sessionRecords || {})
        totalCalls += (fromStorage.totalCalls || 0)
        totalTexts += (fromStorage.totalTexts || 0)
    })

// Load content scripts for enabled domains
browser.permissions.getAll()
    .then(async ({ origins = [] }) => {
        for (let origin of origins) {
            if (OPENVPB_REGEX.test(origin)) {
                await enableOrigin(OPENVPB_ORIGIN)
            } else if (EVERYACTION_REGEX.test(origin)) {
                await enableOrigin(EVERYACTION_ORIGIN)
            } else if (VOTEBUILDER_REGEX.test(origin)) {
                await enableOrigin(VOTEBUILDER_ORIGIN)
            } else if (BLUEVOTE_REGEX.test(origin)) {
                await enableOrigin(BLUEVOTE_ORIGIN)
            } else if (STARTTHEVAN_REGEX.test(origin)) {
                await enableOrigin(STARTTHEVAN_ORIGIN)
            }
        }
    })

// Send message templates if they change
browser.storage.onChanged.addListener(async (changes) => {
    if (!changes.messageTemplates) {
        return
    }

    const messageTemplates = changes.messageTemplates.newValue
    for (let tabId in peers) {
        sendMessage(tabId, {
            type: 'messageTemplateUpdate',
            messageTemplates
        })
    }
})

// Handle messages sent from content scripts
browser.runtime.onMessage.addListener(async (message, sender) => {
    if (typeof message !== 'object') {
        console.log('got message that was not an object', message)
        return
    }

    if (message.type === 'connect') {
        await createPeer(sender.tab.id)
        const openConnections = peers[sender.tab.id].connections.filter(conn => conn && conn.peerConnection && conn.peerConnection.iceConnectionState === 'connected')

        // If the page reloaded, it will send a connect request.
        // Tell it if there were already connected peers so it can correctly display the status
        if (openConnections.length > 0) {
            console.log('letting tab know there is still open connection')
            await browser.tabs.sendMessage(sender.tab.id, {
                type: 'peerConnected'
            })
        }
        return peers[sender.tab.id].url
    } else if (message.type === 'contact') {
        await createPeer(sender.tab.id)
        console.log('sending contact to peer', sender.tab.id)
        const data = message.data
        data.type = 'contact'
        sendMessage(sender.tab.id, data)
    } else if (message.type === 'callResult') {
        const { callNumber, result } = message
        await saveCallResult({
            sessionId: peers[sender.tab.id].sessionId,
            callNumber,
            result
        })
    } else {
        console.log('got unexpected message', message)
    }
})

// Handle tabs closing
browser.tabs.onRemoved.addListener(async (tabId) => {
    if (peers[tabId]) {
        console.log(`sending disconnect message to peer: ${tabId}`)
        sendMessage(tabId, {
            type: 'disconnect'
        })
        // TODO only destroy peer after message has been flushed
        setTimeout(() => {
            console.log(`destroying peer ${tabId} because the tab was closed`)
            destroyPeer(tabId)
        }, 300)
    }
})

async function createPeer(tabId) {
    if (peers[tabId]) {
        if (!peers[tabId].peer) {
            // Duplicate request, currently in the process of connecting
            return
        }
        if (!peers[tabId].peer.destroyed && !peers[tabId].peer.disconnected) {
            // Already connected
            return
        }
    }

    // Create Peer ID
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    const peerId = [...array].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const sessionId = await sessionIdFromPeerId(peerId)

    const version = browser.runtime.getManifest().version
    const userAgent = encodeURIComponent(navigator.userAgent)
    const url = `https://turbovpb.com/connect?session=${sessionId}&version=${version}&userAgent=${userAgent}#${peerId}`

    console.log(`creating peer ${peerId} for tab ${tabId}`)

    peers[tabId] = {
        peer: null,
        peerId,
        url,
        sessionId,
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
    peers[tabId].peer = peer

    peer.on('open', () => console.log(`peer for tab ${tabId} listening for connections`))
    peer.on('error', (err) => {
        console.error(err)
        destroyPeer(tabId)
    })
    peer.on('close', () => {
        console.log(`peer for tab ${tabId} closed`)
        destroyPeer(tabId)
    })

    peer.on('connection', async (conn) => {
        peers[tabId].connections.push(conn)
        const connIndex = peers[tabId].connections.length - 1
        console.log(`peer ${tabId} got connection ${connIndex}`)
        conn.on('close', () => {
            console.log(`peer ${tabId} connection ${connIndex} closed`)
            delete peers[tabId].connections[connIndex]
        })
        conn.on('iceStateChanged', async (state) => {
            console.log(`peer ${tabId} connection ${connIndex} state: ${state}`)
            // TODO if the state is disconnected, should we let the content script know it's disconnected?
            const openConnections = peers[tabId].connections.filter(conn => conn && conn.peerConnection && conn.peerConnection.iceConnectionState === 'connected')
            if (openConnections.length === 0) {
                await browser.tabs.sendMessage(tabId, {
                    type: 'peerDisconnected'
                })
            } else {
                await browser.tabs.sendMessage(tabId, {
                    type: 'peerConnected'
                })
            }
        })
        conn.on('error', (err) => {
            console.log(`peer ${tabId} connection ${connIndex} error`, err)
            delete peers[tabId].connections[connIndex]
        })
        if (conn.serialization === 'json') {
            conn.on('data', async (message) => {
                if (message.type === 'callResult') {
                    console.log(`peer ${tabId} connection ${connIndex} sent call result:`, message)
                    try {
                        await browser.tabs.sendMessage(tabId, {
                            type: 'callResult',
                            result: message.result
                        })

                        if (message.result.toLowerCase() === 'texted') {
                            await saveTextRecord({
                                sessionId,
                                callNumber: message.callNumber,
                                timestamp: message.timestamp
                            })

                        }
                    } catch (err) {
                        console.error('Error sending call result to content_script', err)
                    }
                } else if (message.type === 'callRecord') {
                    await saveCallRecord({
                        sessionId,
                        callNumber: message.callNumber,
                        timestamp: message.timestamp,
                        duration: message.duration
                    })
                } else if (message.type === 'openOptions') {
                    await browser.runtime.openOptionsPage()
                } else {
                    console.warn(`got unexpected message type from peer: ${message.type}`)
                }
            })
        } else {
            console.warn(`Peer connection for peerId ${tabId} serialization should be json but it is: ${conn.serialization}`)
            return destroyPeer(tabId)
        }
        try {
            console.log('requesting contact from content script')
            await browser.tabs.sendMessage(tabId, {
                type: 'contactRequest'
            })
        } catch (err) {
            console.error('Error sending contact request to content_script', err)
            if (err.message === 'tab is null') {
                console.warn('destroying peer because tab was closed')
                destroyPeer(tabId)
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

    browser.browserAction.openPopup()
})

function getContentScripts(origin) {
    if (OPENVPB_REGEX.test(origin)) {
        originSpecificJs = { file: 'openvpb.js' }
    } else if (EVERYACTION_REGEX.test(origin) || VOTEBUILDER_REGEX.test(origin) || STARTTHEVAN_REGEX.test(origin)) {
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

function destroyPeer(tabId) {
    if (peers[tabId]) {
        peers[tabId].peer.destroy()
        delete peers[tabId]
    } else {
        console.warn(`not destroying peer: ${tabId} because it was already destroyed or does not exist`)
    }
}

function sendMessage(tabId, message) {
    if (!peers[tabId] || peers[tabId].connections.length === 0) {
        console.log('not sending message because there is no open connection for peer', tabId)
        return
    }

    message.extensionVersion = browser.runtime.getManifest().version
    message.extensionUserAgent = navigator.userAgent
    message.extensionPlatform = navigator.platform
    const connectedPeers = peers[tabId].connections.filter((conn) => !!conn)
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

// This comes from the mobile page
async function saveCallRecord({ sessionId, callNumber, timestamp, duration }) {
    console.log(`saving call record for session: ${sessionId} call ${callNumber}, duration: ${duration}`)
    if (!sessionRecords[sessionId]) {
        sessionRecords[sessionId] = []
    }
    if (!sessionRecords[sessionId][callNumber]) {
        sessionRecords[sessionId][callNumber] = []
    }
    sessionRecords[sessionId][callNumber][TIMESTAMP_INDEX] = timestamp
    sessionRecords[sessionId][callNumber][DURATION_INDEX] = duration
    totalCalls += 1

    // TODO make sure we don't run out of storage space
    await browser.storage.local.set({ sessionRecords, totalCalls })
}

// This comes from the content script
async function saveCallResult({ sessionId, callNumber, result }) {
    console.log(`saving call result for session: ${sessionId} call ${callNumber}, result: ${result}`)
    if (!sessionRecords[sessionId]) {
        sessionRecords[sessionId] = []
    }
    if (!sessionRecords[sessionId][callNumber]) {
        sessionRecords[sessionId][callNumber] = []
    }
    if (!sessionRecords[sessionId][callNumber][TIMESTAMP_INDEX]) {
        sessionRecords[sessionId][callNumber][TIMESTAMP_INDEX] = Date.now()
    }
    if (!sessionRecords[sessionId][callNumber][RESULT_INDEX]) {
        sessionRecords[sessionId][callNumber][RESULT_INDEX] = RESULT_CODES[result] || result
    }

    await browser.storage.local.set({ sessionRecords })
}

// This comes from the mobile site
async function saveTextRecord({ sessionId, callNumber, timestamp }) {
    console.log(`saving text for session: ${sessionId} call ${callNumber}`)
    if (!sessionRecords[sessionId]) {
        sessionRecords[sessionId] = []
    }
    if (!sessionRecords[sessionId][callNumber]) {
        sessionRecords[sessionId][callNumber] = []
    }

    sessionRecords[sessionId][callNumber][RESULT_INDEX] = RESULT_CODES.Texted
    sessionRecords[sessionId][callNumber][TEXTED_TIMESTAMP_INDEX] = timestamp
    totalTexts += 1

    await browser.storage.local.set({ sessionRecords, totalTexts })
}

function getTotalCalls() {
    return totalCalls
}

// This uses half of a SHA-256 hash of the peerId as a session ID
// The session ID is currently used only to ensure that the mobile browser
// reloads the tab if you open a different link (the tab will not be reloaded
// if only the hash changes)
async function sessionIdFromPeerId(peerId) {
    const peerIdArray = [...peerId].reduce((result, char, index, array) => {
        if (index % 2 === 0) {
            result.push(parseInt(array.slice(index, index + 2).join(''), 16))
        }
        return result
    }, [])
    const peerIdHashArray = new Uint8Array(await window.crypto.subtle.digest('SHA-256', Uint8Array.from(peerIdArray)))
    const peerIdHash = [...peerIdHashArray].map(byte => byte.toString(16).padStart(2, '0')).join('')
    return peerIdHash.slice(0, 16)
}