const FINAL_ERRORS = ['browser-incompatible', 'invalid-id', 'invalid-key', 'ssl-unavailable', 'unavailable-id']
const MAX_RECONNECT_ATTEMPTS = 3

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
const TURBOVPB_SHARE_ORIGIN = 'https://turbovpb.com/share*'

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
        try {
            await injectShareScript()
        } catch (err) {
            console.error('Error injecting share script', err)
        }
        for (let origin of origins) {
            if (origin.includes('turbovpb')
                || origin.includes('localhost')
                || !origin.startsWith('http')) {
                continue
            }

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
            } else {
                try {
                    await enableOrigin(origin)
                } catch (err) {
                    console.error(`Error enabling origin: ${origin}`, err)
                }
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
        if (peers[sender.tab.id].peer.isConnected()) {
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

// Run when installed or updated
browser.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
    const { statsStartDate } = await browser.storage.local.get(['statsStartDate'])
    if (!statsStartDate) {
        console.log('setting stats start date')
        await browser.storage.local.set({ statsStartDate: (new Date()).toISOString() })
    }

    if (typeof browser.browserAction.openPopup === 'function') {
        browser.browserAction.openPopup()
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

    const peer = new PeerConnection()
    const sessionId = peer.getSessionId()
    const connectionSecret = peer.getConnectionSecret()
    const version = browser.runtime.getManifest().version
    const userAgent = encodeURIComponent(navigator.userAgent)
    const tabUrl = await browser.tabs.get(tabId).url
    let domain = ''
    if (tabUrl) {
        domain = (new URL(tabUrl)).host
    }
    const url = `https://turbovpb.com/connect?session=${sessionId}&version=${version}${domain ? '&domain=' + encodeURIComponent(domain) : ''}&userAgent=${userAgent}#${connectionSecret}`

    let connectionAttempt = 0
    peers[tabId] = {
        peer,
        url,
        sessionId
    }
    peer.onerror = async (err) => {
        console.log(`error from peer for tab ${tabId}`, err)
        await browser.tabs.sendMessage(tabId, {
            type: 'peerError'
        })

        if (!err || !FINAL_ERRORS.includes(err.type)) {
            connectionAttempt += 1
            if (connectionAttempt++ > MAX_RECONNECT_ATTEMPTS) {
                console.error('exceeded max number of reconnection attempts')
                return
            }
            await peer.reconnect()
        }
    }
    peer.onconnect = async () => {
        connectionAttempt = 0
        try {
            await browser.tabs.sendMessage(tabId, {
                type: 'peerConnected'
            })
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
    }
    peer.ondisconnect = async () => {
        await browser.tabs.sendMessage(tabId, {
            type: 'peerDisconnected'
        })
    }
    peer.onmessage = async (message) => {
        if (message.type === 'connect') {
            console.log(`got connect message from peer ${tabId}`)
            await browser.tabs.sendMessage(tabId, {
                type: 'contactRequest'
            })
        } else if (message.type === 'callResult') {
            console.log(`peer ${tabId} connection sent call result:`, message)
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
    }
    await peer.connect()
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
    if (!peers[tabId]) {
        return
    }

    message.extensionVersion = browser.runtime.getManifest().version
    message.extensionUserAgent = navigator.userAgent
    message.extensionPlatform = navigator.platform

    peers[tabId].peer.sendMessage(message)
}

async function injectShareScript() {
    console.log('Registering share integration content script')
    await browser.contentScripts.register({
        matches: [TURBOVPB_SHARE_ORIGIN],
        js: [
            { file: 'dependencies/browser-polyfill.js' },
            { file: 'dependencies/tingle.js' },
            { file: 'share-integration.js' },
        ],
        css: [{ file: 'dependencies/tingle.css' }]
    })
}

function getContentScripts(origin) {
    if (OPENVPB_REGEX.test(origin)) {
        originSpecificJs = { file: 'openvpb.js' }
    } else if (BLUEVOTE_REGEX.test(origin)) {
        originSpecificJs = { file: 'bluevote.js' }
    } else {
        // All other possibilities are instances of VAN
        originSpecificJs = { file: 'everyaction.js' }
    }
    return [
        { file: 'dependencies/browser-polyfill.js' },
        { file: 'dependencies/tingle.js' },
        { file: 'dependencies/kjua.js' },
        { file: 'vpb-common.js' },
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
