let messageTemplates = []
let yourName = ''

let peer
let conn

let startTime = Date.now()

// Analytics
const tracker = ackeeTracker.create({
    server: 'https://analytics.turbovpb.com',
    domainId: 'ce7e5171-35be-4728-9e90-575ab21f850f'
})

const url = new URL(window.location.href)
url.hash = ''
const stopTracking = tracker.record({
    siteLocation: url.toString(),
    siteReferrer: document.referrer || null
})
window.addEventListener('beforeunload', () => stopTracking())


const remotePeerId = window.location.hash.slice(1)
const debugMode = window.location.search.includes('debug=true')
const log = debugMode ? debugLog : console.log
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
    connectPeer()
    let visibilityChange
    let hidden
    if (typeof document.hidden !== "undefined") {
        hidden = "hidden";
        visibilityChange = "visibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
        hidden = "msHidden";
        visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
        hidden = "webkitHidden";
        visibilityChange = "webkitvisibilitychange";
    }

    document.addEventListener(visibilityChange, () => {
        log(visibilityChange, 'hidden:', document[hidden])
        if (!document[hidden]) {
            unfocusButtons()
            connectPeer()
        }
    })
    window.addEventListener('focus', () => {
        log('focus')
        unfocusButtons()
        connectPeer()
    })
    window.addEventListener('pageshow', () => {
        log('pageshow')
        unfocusButtons()
        connectPeer()
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

function unfocusButtons() {
    const buttons = document.getElementsByClassName('btn')
    for (let i = 0; i < buttons.length; i++) {
        buttons[i].blur()
        buttons[i].classList.remove('active')
    }
}

function connectPeer() {
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
    })
    peer.on('disconnect', () => {
        log('peer disconnected')
        connectPeer()
    })
    peer.on('error', (err) => {
        log(err)
        setStatus('Error. Reload Tab.', 'danger')

        // Display full error message
        document.getElementById('warningHeading').innerText = 'Error Connecting to Extension'
        document.getElementById('warningText1').innerText = `Error details: ${err.message}`
        document.getElementById('warningText2').innerText =
            `Try closing the OpenVPB tab in your browser, opening a new one, and re-scanning the QR code.`
        document.getElementById('warningText2').hidden = false
        document.getElementById('warningContainer').hidden = false

        // Clear the contact details
        document.getElementById('contactDetails').hidden = true
        document.getElementById('statistics').hidden = true
        document.getElementById('name').innerText = ''
        document.getElementById('phoneNumber').href = ''
        document.getElementById('phoneNumber').innerText = ''
    })
    peer.once('open', () => {
        log('peer opened')
        opened = true
        establishConnection()
    })
}

function establishConnection() {
    log('establish connection')
    if (conn && conn.open) {
        log('connection already good')
        setStatus('Connected', 'success')
        document.getElementById('warningContainer').hidden = true
        return
    }
    // Update session time
    setInterval(() => {
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
    })
    conn.once('error', (err) => {
        log(err)
        conn = null

        setStatus('Error. Reload Tab.', 'danger')
    })
    conn.once('close', () => {
        setStatus('Not Connected', 'danger')

        conn = null
        setTimeout(() => {
            connectPeer()
        }, 1000)
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
            document.getElementById('contactDetails').hidden = false
            document.getElementById('statistics').hidden = false

            document.getElementById('name').innerText = `${data.contact.firstName} ${data.contact.lastName}`

            let phoneNumber = data.contact.phoneNumber.match(/\d+/g).join('')
            if (phoneNumber.length === 10) {
                phoneNumber = '1' + phoneNumber
            }

            document.getElementById('phoneNumber').href = "tel:" + phoneNumber
            document.getElementById('phoneNumber').innerText = `Call ${data.contact.phoneNumber}`

            // TODO: reuse elements?
            const textMessageLinks = document.getElementById('textMessageLinks')
            while (textMessageLinks.firstChild) {
                textMessageLinks.removeChild(textMessageLinks.firstChild)
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
                document.getElementById('numCalls').innerText = `${data.stats.calls} Call${data.stats.calls > 1 ? 's' : ''}`
                document.getElementById('avgCallTime').innerText = msToTimeString((Date.now() - startTime) / data.stats.calls)
            }
            if (data.stats.successfulCalls) {
                document.getElementById('successfulCalls').innerText = data.stats.successfulCalls
            }
        }
    })
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