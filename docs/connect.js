const debugMode = window.location.href.includes('debug')
const searchParams = (new URL(window.location.href)).searchParams
const sessionId = searchParams.get('session') || ''
const extensionVersion = searchParams.get('version') || '<0.6.3'
const extensionUserAgent = searchParams.get('userAgent') || ''
const remotePeerId = window.location.hash.slice(1)
    .replace(/&.*/, '')

let messageTemplates = []
let yourName = ''

let startTime = Date.now()
let sessionTimeInterval
let sessionComplete = false

let windowIsHidden = false
let pageIsVisibleTimeout
let peerManager

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
    console.error('error setting up tracking', err)
}

// Error tracking
if (Sentry) {
    Sentry.init({
        dsn: 'https://6c908d99b8534acebf2eeecafeb1614e@o435207.ingest.sentry.io/5393315',
        release: extensionVersion,
        beforeBreadcrumb: (breadcrumb) => {
            if (breadcrumb.category === 'xhr' &&
                breadcrumb.data && breadcrumb.data.url === 'https://analytics.turbovpb.com/api') {
                return null
            } else {
                return breadcrumb
            }
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
function isHidden() {
    return document.visibilityState === 'hidden' || document[hidden]
}

// Connect to the extension if a remotePeerId is specified and the session isn't complete
if (remotePeerId) {
    if (sessionIsComplete()) {
        markSessionComplete()
    } else {
        // Create PeerManager and set up event handlers
        peerManager = new PeerManager({
            debugMode,
            remotePeerId
        })
        peerManager.onConnect = () => {
            setStatus('Connected', 'success')

            // Update session time
            if (!sessionTimeInterval) {
                sessionTimeInterval = setInterval(() => {
                    document.getElementById('sessionTime').innerText = msToTimeString(Date.now() - startTime)
                }, 1000)
            }
        }
        peerManager.onData = handleData
        peerManager.onReconnecting = () => {
            if (sessionIsComplete()) {
                peerManager.stop()
                return
            }

            setStatus('Connecting to Extension', 'warning')
            document.getElementById('warningContainer').hidden = true
        }
        peerManager.onError = (err) => {
            // Most errors will be caused by the page being put to sleep.
            // For any other errors, we want to stop trying to reconnect,
            // display the error details to the user, and report the error to Sentry.
            if (windowIsHidden) {
                console.log('not showing error because page is not visible')
            } else {
                peerManager.stop()
                displayError(err)

                Sentry.captureException(err, {
                    tags: {
                        error_type: err.type
                    }
                })
            }
        }

        peerManager.connect()

        document.addEventListener(visibilityChange, async () => {
            console.log(visibilityChange, 'hidden:', isHidden())
            if (isHidden()) {
                windowIsHidden = true
            } else {
                await pageBecameVisible()
            }
        })
        window.addEventListener('focus', pageBecameVisible)
    }
} else {
    // Show error
    document.getElementById('mainContainer').setAttribute('hidden', true)
    document.getElementById('warningContainer').removeAttribute('hidden')
}

async function pageBecameVisible() {
    if (sessionIsComplete()) {
        return
    }

    unfocusButtons()

    // These should trigger after the error event handler.
    // Even though the error happens while the page is hidden,
    // the event handler may only be triggered once it is visible
    // again. By only unsetting the windowIsHidden variable after
    // a timeout, we make sure to avoid showing and reporting to
    // Sentry errors that are simply caused by the mobile browser
    // putting the page to sleep.
    if (!pageIsVisibleTimeout) {
        await new Promise((resolve) => pageIsVisibleTimeout = setTimeout(resolve, 50))
        pageIsVisibleTimeout = null
        windowIsHidden = false
        console.log('window became visible, triggering reconnect')
        try {
            await peerManager.reconnect()
        } catch (err) {
            console.error('error calling reconnect', err)
        }
    }
}

function handleData(data) {
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
                    console.log(`sending call result: ${result}`)
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
        console.log('got disconnect message from extension')
        markSessionComplete()
    }
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
    setStatus('Error. Reload Tab.', 'danger')

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
}

function markSessionComplete() {
    sessionComplete = true
    window.sessionStorage.setItem('sessionComplete', 'true')
    document.getElementById('contactDetails').remove()
    document.getElementById('sessionEnded').removeAttribute('hidden')

    if (sessionTimeInterval) {
        clearInterval(sessionTimeInterval)
    }

    if (peerManager) {
        peerManager.stop()
    }

    setStatus('Session Complete', 'primary')
}

function sessionIsComplete() {
    if (sessionComplete) {
        return true
    }
    try {
        // This may result in "SecurityError: The operation is insecure."
        if (window.sessionStorage.getItem('sessionComplete') === 'true') {
            return true
        }
    } catch (err) { }
    return false
}

function unfocusButtons() {
    const buttons = document.getElementsByClassName('btn')
    for (let i = 0; i < buttons.length; i++) {
        buttons[i].blur()
        buttons[i].classList.remove('active')
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
