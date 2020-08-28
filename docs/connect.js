let messageTemplates = []
let yourName = ''

let peer
let conn
let lastConnectPeerTime

let startTime = Date.now()
let sessionTimeInterval

// Details used for tracking errors with Sentry
let hasConnected = false
let reportedErrorSinceLastConnect = false
let numErrors = 0
let numPeersOpened = 0
let numConnectionsOpened = 0

let iceServers = [{
    "url": "stun:stun.l.google.com:19302",
    "urls": "stun:stun.l.google.com:19302"
}, {
    "url": "stun:global.stun.twilio.com:3478?transport=udp",
    "urls": "stun:global.stun.twilio.com:3478?transport=udp"
}]

const debugMode = window.location.href.includes('debug')
const log = debugMode ? debugLog : console.log
const searchParams = (new URL(window.location.href)).searchParams
const sessionId = searchParams.get('session') || ''
const extensionVersion = searchParams.get('version') || '<0.6.3'
const extensionUserAgent = searchParams.get('userAgent') || ''
const remotePeerId = window.location.hash.slice(1)
    .replace(/&.*/, '')

// Initialization

// Analytics
try {
    const tracker = ackeeTracker.create({
        server: 'https://analytics.turbovpb.com',
        domainId: 'ed7f1c2b-46bc-4858-8221-4b9133ac88ca'
    })

    const url = new URL(window.location.href)
    url.hash = ''
    const attributes = ackeeTracker.attributes(true)
    attributes.siteLocation = url.toString()

    const { stop: stopTracking } = tracker.record(attributes)
    window.addEventListener('beforeunload', () => stopTracking())
} catch (err) {
    log('error setting up tracking', err)
}

// Error tracking
if (Sentry) {
    Sentry.init({
        dsn: 'https://6c908d99b8534acebf2eeecafeb1614e@o435207.ingest.sentry.io/5393315',
        release: extensionVersion,
        beforeSend: (event) => {
            if (!event.extra) {
                event.extra = {}
            }
            event.extra.num_errors = numErrors
            event.extra.num_connections_opened = numConnectionsOpened
            event.extra.num_peers_opened = numPeersOpened
            return event
        }
    });
    Sentry.configureScope(function (scope) {
        scope.setUser({
            id: sessionId,
        })
        scope.setTag('extension_version', extensionVersion)
        scope.setTag('extension_useragent', extensionUserAgent)
        scope.setTag('debug_mode', debugMode)
    })
}

// Page visibility API
let hidden
let visibilityChange
if (typeof document.hidden !== "undefined") {
    hidden = "hidden";
    visibilityChange = "visibilitychange";
} else if (typeof document.msHidden !== "undefined") {
    hidden = "msHidden";
    visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
    hidden = "webkitHidden";
    visibilityChange = "webkitvisibilitychange";
} else {
    const err = new Error('This site requires a browser, such as Google Chrome, Firefox, or Safari, that supports the Page Visibility API.')
    displayError(err)
    throw err
}

// Try getting ICE Servers
fetch('https://nts.turbovpb.com/ice')
    .then(function (response) {
        return response.json()
    })
    .then(function (json) {
        iceServers = json
        iceServers = iceServers.slice(0, 2)
        log('using ice servers', iceServers)
    })
    .catch(function (err) {
        log('error getting ice servers', err)
    })

if (debugMode) {
    log('debug mode enabled')
    document.getElementById('contactDetails').classList.remove('fixed-bottom')
}

if (remotePeerId) {
    connectToExtension()
} else {
    document.getElementById('mainContainer').setAttribute('hidden', true)
    document.getElementById('warningContainer').removeAttribute('hidden')
}

function connectToExtension() {
    if (window.sessionStorage.getItem('sessionComplete') === 'true') {
        sessionComplete()
        return
    }

    connectPeer()

    document.addEventListener(visibilityChange, onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
}

function onVisibilityChange() {
    log(visibilityChange, 'hidden:', document[hidden])
    if (!document[hidden]) {
        unfocusButtons()
        connectPeer()
    }
}
function onFocus() {
    log('focus')
    unfocusButtons()
    connectPeer()
}
function onPageShow() {
    log('pageshow')
    unfocusButtons()
    connectPeer()
}

function connectPeer() {
    if (window.sessionStorage.getItem('sessionComplete') === 'true') {
        return
    }

    // This should be called at most once every 100ms
    if (lastConnectPeerTime && Date.now() - lastConnectPeerTime < 100) {
        return
    }
    lastConnectPeerTime = Date.now()

    if (peer && !peer.destroyed && !peer.disconnected) {
        establishConnection()
        return
    }

    setStatus('Connecting to Server', 'warning')
    document.getElementById('warningContainer').hidden = true

    log('creating new peer')
    peer = new Peer({
        host: 'peerjs.turbovpb.com',
        secure: true,
        debug: debugMode ? 3 : 1,
        config: {
            iceServers
        }
    })
    peer.on('disconnect', () => {
        log('peer disconnected')
        connectPeer()
    })
    peer.on('error', (err) => {
        console.error('peer error', err)
        displayError(err)
    })
    peer.once('open', () => {
        log('peer opened')
        opened = true
        numPeersOpened += 1
        establishConnection()
    })
}

function establishConnection() {
    if (window.sessionStorage.getItem('sessionComplete') === 'true') {
        return
    }

    log('establish connection')
    if (conn && conn.open) {
        log('connection already good')
        setStatus('Connected', 'success')
        document.getElementById('warningContainer').hidden = true
        return
    }
    // Update session time
    sessionTimeInterval = setInterval(() => {
        document.getElementById('sessionTime').innerText = msToTimeString(Date.now() - startTime)
    }, 1000)

    setStatus('Connecting to Extension', 'warning')
    document.getElementById('warningContainer').hidden = true
    log('connecting to ', remotePeerId)
    conn = peer.connect(remotePeerId, {
        serialization: 'json'
    })
    conn.once('open', () => {
        log('connection open')
        setStatus('Connected', 'success')
        hasConnected = true
        numConnectionsOpened += 1

        // Report if the user saw an error but then it reconnected
        // TODO maybe save this to sessionStorage in case they reload
        if (reportedErrorSinceLastConnect) {
            Sentry.captureMessage('connection opened', 'debug')
            reportedErrorSinceLastConnect = false
        }
    })
    conn.once('error', (err) => {
        conn = null
        console.error('connection error', err)
        displayError(err)
    })
    conn.once('close', () => {
        log('connection closed')
        conn = null

        if (window.sessionStorage.getItem('sessionComplete') !== 'true') {
            setStatus('Not Connected', 'danger')
            setTimeout(() => {
                connectPeer()
            }, 300)
        }
    })
    conn.on('data', (data) => {
        log('got data', data)
        if (data.yourName) {
            yourName = data.yourName
        }
        if (data.messageTemplates) {
            messageTemplates = data.messageTemplates
        }
        if (data.contact) {
            const matches = data.contact.phoneNumber.match(/\d+/g)
            if (!matches) {
                return displayError(new Error(`Got invalid phone number from extension: ${data.contact.phoneNumber}`))
            }
            let phoneNumber = matches.join('')
            if (phoneNumber.length === 10) {
                phoneNumber = '1' + phoneNumber
            }

            document.getElementById('contactDetails').hidden = false
            document.getElementById('statistics').hidden = false

            document.getElementById('name').innerText = `${data.contact.firstName} ${data.contact.lastName}`

            document.getElementById('phoneNumber').href = "tel:" + phoneNumber
            document.getElementById('phoneNumber').innerText = `Call ${data.contact.phoneNumber}`

            // TODO: reuse elements?
            const textMessageLinks = document.getElementById('textMessageLinks')
            while (textMessageLinks.firstChild) {
                textMessageLinks.removeChild(textMessageLinks.firstChild)
            }
            if (messageTemplates.length === 0) {
                document.getElementById('textMessageInstructions')
                    .removeAttribute('hidden')
            } else {
                document.getElementById('textMessageInstructions')
                    .setAttribute('hidden', 'true')
            }
            for (let { label, message, result } of messageTemplates) {
                const a = document.createElement('a')
                a.className = "btn btn-outline-secondary btn-block p-3 my-3"
                a.role = 'button'
                a.target = "_blank"
                const messageBody = message
                    .replace(/\[their name\]/i, data.contact.firstName)
                    .replace(/\[your name\]/i, yourName)
                a.href = `sms://${phoneNumber}?&body=${messageBody}`
                a.innerText = `Send ${label}`
                if (result) {
                    a.addEventListener('click', () => {
                        log(`sending call result: ${result}`)
                        conn.send({
                            type: 'callResult',
                            result
                        })
                    })
                }
                textMessageLinks.appendChild(a)
            }
        }

        if (data.stats) {
            if (data.stats.startTime) {
                startTime = data.stats.startTime
            }
            if (data.stats.calls && data.stats.calls > 0) {
                // TODO maybe update this as the duration is being updated (every second)
                document.getElementById('numCalls').innerText = `${data.stats.calls} Call${data.stats.calls > 1 ? 's' : ''}`
                document.getElementById('avgCallTime').innerText = msToTimeString((Date.now() - startTime) / data.stats.calls)
            }
            if (data.stats.successfulCalls) {
                document.getElementById('successfulCalls').innerText = data.stats.successfulCalls
            }
        }
        if (data.type === 'disconnect') {
            log('got disconnect message from extension')
            sessionComplete()
        }
    })
}

function setStatus(status, alertType) {
    if (document.readyState === 'complete') {
        const statusElement = document.getElementById('status')
        statusElement.innerText = status
        statusElement.className = statusElement.className.replace(/badge-\w+/, `badge-${alertType}`)
    } else {
        function listener() {
            if (document.readyState === 'complete') {
                document.removeEventListener('readystatechange', listener)
                setStatus(status, alertType)
            }
        }
        document.addEventListener('readystatechange', listener)
    }
}

function displayError(err) {
    if (err.type) {
        log(`Error (type: ${err.type}):`, err)
    } else {
        log(err)
    }
    setStatus('Error. Reload Tab.', 'danger')

    // Display error details if the error was not caused by the page being put to sleep
    if (document[hidden]) {
        return
    }
    // Display full error message
    document.getElementById('warningHeading').innerText = 'Error Connecting to Extension'
    document.getElementById('warningText1').innerText = `Error ${(err.type && err.type.replace('-', ' ')) || 'details'}: ${err.message}`

    if (err.type !== 'browser-incompatible') {
        const warningText2 = document.getElementById('warningText2')
        warningText2.innerHTML = ''
        warningText2.innerText =
            `Try closing the OpenVPB tab in your browser, opening a new one, and re-scanning the QR code. If that doesn't work, please send this pre-filled email to: `
        const a = document.createElement('a')
        a.innerText = 'evan@turbovpb.com'
        const emailBody = encodeURIComponent(`Hi Evan,

        I like the idea for TurboVPB but I ran into a problem trying to use it. Please fix this issue.

        Thank you!


        Error: ${err.type} ${err.message}
        Session: ${sessionId}
        Extension Version: ${extensionVersion}
        Desktop Browser: ${extensionUserAgent}
        Mobile Browser: ${navigator.userAgent}`)
        a.href = `mailto:evan@turbovpb.com?subject=${encodeURIComponent('Problem with TurboVPB')}&body=${emailBody}`
        warningText2.appendChild(a)
        warningText2.appendChild(document.createTextNode('.'))
    } else {
        document.getElementById('warningText2').innerText =
            'Unfortunately, this means that TurboVPB will not work on your phone. Sorry :('
    }
    document.getElementById('warningText2').hidden = false
    document.getElementById('warningContainer').hidden = false

    // Clear the contact details
    document.getElementById('contactDetails').hidden = true
    document.getElementById('statistics').hidden = true
    document.getElementById('name').innerText = ''
    document.getElementById('phoneNumber').href = ''
    document.getElementById('phoneNumber').innerText = ''

    // Report error to Sentry
    // Ignore connection errors that happen after the initial connect
    // because they are likely caused by the browser putting the tab to sleep
    numErrors += 1
    if (!hasConnected || (err.type !== 'disconnected' && err.type !== 'network')) {
        reportedErrorSinceLastConnect = true
        Sentry.captureException(err, {
            tags: {
                error_type: err.type
            }
        })
    }
}


function sessionComplete() {
    window.sessionStorage.setItem('sessionComplete', 'true')
    document.getElementById('contactDetails').remove()
    document.getElementById('sessionEnded').removeAttribute('hidden')

    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('pageshow', onPageShow)

    if (sessionTimeInterval !== null) {
        clearInterval(sessionTimeInterval)
    }
    if (peer) {
        peer.destroy()
    }
    setStatus('Session Complete', 'primary')
}

function unfocusButtons() {
    const buttons = document.getElementsByClassName('btn')
    for (let i = 0; i < buttons.length; i++) {
        buttons[i].blur()
        buttons[i].classList.remove('active')
    }
}

function debugLog() {
    console.log.apply(null, arguments)
    if (debugMode) {
        const p = document.createElement('p')
        p.innerText = Array.prototype.map.call(arguments, s => {
            if (typeof s === 'string') {
                return s
            } else {
                return JSON.stringify(s)
            }
        }).join(' ')
        document.getElementById('debug').appendChild(p)
    }
}

function msToTimeString(ms) {
    let time = ''
    const hours = Math.floor(ms / 3600000)
    const min = Math.floor((ms % 3600000) / 60000)
    const sec = Math.floor((ms % 60000) / 1000)
    if (hours > 0) {
        time += hours + ':'
    }
    if (min < 10) {
        time += '0' + min
    } else {
        time += min
    }
    time += ':'
    if (sec < 10) {
        time += '0' + sec
    } else {
        time += sec
    }
    return time
}
