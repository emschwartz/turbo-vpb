const debugMode = window.location.href.includes('debug')
const searchParams = (new URL(window.location.href)).searchParams
const sessionId = searchParams.get('session') || ''
const extensionVersion = searchParams.get('version') || '<0.6.3'
const extensionUserAgent = searchParams.get('userAgent') || ''
const remotePeerId = window.location.hash.slice(1)
    .replace(/&.*/, '')

let messageTemplates = []
let phoneNumber
let firstName
let yourName = ''

let startTime = Date.now()
let sessionTimeInterval
let sessionComplete = false
let lastCallStartTime
let callNumber

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
    console.log('Re-initializing Sentry')
    Sentry.init({
        dsn: 'https://6c908d99b8534acebf2eeecafeb1614e@o435207.ingest.sentry.io/5393315',
        release: extensionVersion,
        beforeBreadcrumb: (breadcrumb) => {
            if (breadcrumb.category === 'xhr' &&
                breadcrumb.data &&
                (breadcrumb.data.url.startsWith('https://analytics.turbovpb.com' || breadcrumb.data.url.startsWith('https://stats.turbovpb.com')))) {
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
} else {
    console.error('Could not load Sentry')
}

if (/^0\.7\./.test(extensionVersion)) {
    document.getElementById('textMessageInstructionsTextOnly').setAttribute('hidden', 'true')
    document.getElementById('textMessageInstructionsWithLink').removeAttribute('hidden')

    document.getElementById('openOptionsPage').addEventListener('click', async (e) => {
        e.preventDefault()

        if (peerManager) {
            await peerManager.sendMessage({
                type: 'openOptions'
            })
        } else {
            console.error('cannot send open options message because peer manager is undefined')
        }
    })
}

// Connect to the extension if a remotePeerId is specified and the session isn't complete
if (sessionIsComplete()) {
    markSessionComplete()
} else if (!remotePeerId) {
    // Show error
    document.getElementById('mainContainer').setAttribute('hidden', true)
    document.getElementById('warningContainer').removeAttribute('hidden')
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
    peerManager.onReconnecting = (target) => {
        if (sessionIsComplete()) {
            peerManager.stop()
            return
        }

        setStatus(`Connecting to ${target || 'Extension'}`, 'warning')
        document.getElementById('warningContainer').hidden = true
        document.getElementById('contactDetails').hidden = true
    }
    peerManager.onError = (err) => {
        displayError(err)

        Sentry.captureException(err, {
            tags: {
                error_type: err.type
            }
        })
    }

    peerManager.connect()

    // Estimate call duration
    // Start the timer either on click or on the touchstart event
    document.getElementById('phoneNumber')
        .addEventListener('click', (e) => {
            if (window.localStorage.getItem('requireLongPressMode')) {
                e.preventDefault()
                const label = e.target.innerText
                e.target.classList.replace('btn-primary', 'btn-warning')
                e.target.innerText = 'Long-Press to Call'
                setTimeout(() => {
                    e.target.innerText = label
                    e.target.classList.replace('btn-warning', 'btn-primary')
                }, 800)
            } else {
                lastCallStartTime = Date.now()
            }
        })
    document.getElementById('phoneNumber')
        .addEventListener('touchstart', () => {
            if (window.localStorage.getItem('requireLongPressMode')) {
                lastCallStartTime = Date.now()
            }
        })

    // Require long-press mode setting
    if (window.localStorage.getItem('requireLongPressMode')) {
        document.getElementById('requireLongPressMode').checked = true
    }
    document.getElementById('requireLongPressMode')
        .addEventListener('change', (e) => {
            if (e.target.checked) {
                window.localStorage.setItem('requireLongPressMode', 'true')
            } else {
                window.localStorage.removeItem('requireLongPressMode')
            }
        })

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible') {
            return
        }

        // Make sure we're still connected
        if (peerManager) {
            await peerManager.reconnect(null, true)
        }

        // Collect call statistics
        if (lastCallStartTime) {
            const duration = Date.now() - lastCallStartTime
            console.log(`last call duration was approximately ${duration}ms`)

            await peerManager.sendMessage({
                type: 'callRecord',
                timestamp: lastCallStartTime,
                callNumber,
                duration
            })
            lastCallStartTime = null

            try {
                // TODO we might miss the last call if they never return to the page
                await fetchRetry(`https://stats.turbovpb.com/sessions/${sessionId}/calls`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8'
                    },
                    body: JSON.stringify({
                        duration
                        // TODO add call result
                    })
                }, 3)
            } catch (err) {
                console.error('Error saving call stats', err)
            }
        }
    })
}

function handleData(data) {
    if (data.yourName) {
        yourName = data.yourName
    }

    if (data.messageTemplates) {
        messageTemplates = data.messageTemplates

        // If we only received new message templates, recreate the links with the old contact details
        if (!data.contact) {
            createTextMessageLinks(firstName, phoneNumber)
        }
    }

    if (typeof data.callNumber === 'number') {
        callNumber = data.callNumber
    }

    if (data.contact) {
        if (!data.contact.phoneNumber || !data.contact.firstName) {
            return displayError(new Error(`Got invalid contact details from extension: ${JSON.stringify(data.contact)}`))
        }
        const matches = data.contact.phoneNumber.match(/\d+/g)
        if (!matches) {
            return displayError(new Error(`Got invalid phone number from extension: ${data.contact.phoneNumber}`))
        }
        phoneNumber = matches.join('')
        if (phoneNumber.length === 10) {
            phoneNumber = '1' + phoneNumber
        }
        firstName = data.contact.firstName

        document.getElementById('contactDetails').hidden = false
        document.getElementById('statistics').hidden = false

        document.getElementById('name').innerText = `${data.contact.firstName} ${data.contact.lastName}`

        document.getElementById('phoneNumber').href = "tel:" + phoneNumber
        document.getElementById('phoneNumber').innerText = `Call ${data.contact.phoneNumber}`

        createTextMessageLinks(firstName, phoneNumber)
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

function createTextMessageLinks(firstName, phoneNumber) {
    const textMessageLinks = document.getElementById('textMessageLinks')
    while (textMessageLinks.firstChild) {
        textMessageLinks.removeChild(textMessageLinks.firstChild)
    }
    if (messageTemplates.length === 0) {
        document.getElementById('textMessageInstructions')
            .removeAttribute('hidden')
    }
    else {
        document.getElementById('textMessageInstructions')
            .setAttribute('hidden', 'true')
    }
    for (let { label, message, result } of messageTemplates) {
        const a = document.createElement('a')
        a.className = "btn btn-outline-secondary btn-block p-3 my-3"
        a.role = 'button'
        a.target = "_blank"
        const messageBody = message
            .replace(/\[their name\]/i, firstName)
            .replace(/\[your name\]/i, yourName)
        a.href = `sms://${phoneNumber};?&body=${messageBody}`
        a.innerText = `Send ${label}`
        a.addEventListener('click', async (e) => {
            if (window.localStorage.getItem('requireLongPressMode')) {
                console.log('long press mode enabled, ignoring click')
                try {
                    e.preventDefault()
                }
                catch (err) {
                    console.error('error preventing click on text message button', err.message)
                }
                // Copy the message body to the clipboard instead
                // TODO figure out if there's a better option than this
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(messageBody)
                    a.innerText = 'Message Copied to Clipboard'
                    a.classList.replace('btn-outline-secondary', 'btn-outline-success')
                    setTimeout(() => {
                        a.innerText = `Send ${label}`
                        a.classList.replace('btn-outline-success', 'btn-outline-secondary')
                    }, 800)
                }
            }
            else {
                if (result) {
                    console.log(`sending call result: ${result}`)
                    await peerManager.sendMessage({
                        type: 'callResult',
                        result,
                        callNumber,
                        timestamp: (new Date()).toISOString()
                    })
                    try {
                        await fetchRetry(`https://stats.turbovpb.com/sessions/${sessionId}/texts`, {
                            method: 'POST'
                        }, 3)
                    } catch (err) {
                        console.error('Error saving text stats', err)
                    }
                }
            }
        })
        textMessageLinks.appendChild(a)
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

async function fetchRetry(url, params, times) {
    if (!times) {
        times = 3
    }
    let backoff = 50
    let error
    while (times > 0) {
        try {
            const response = await fetch(url, params)
            if (response.ok) {
                return response
            } else {
                console.error('fetch response was not ok')
            }
        } catch (err) {
            error = err
        }

        // TODO don't retry fatal errors
        times -= 1
        if (times === 0) {
            throw error
        } else {
            console.error('fetch error, retrying', error)
            await new Promise((resolve) => setTimeout(resolve, backoff))
            backoff = backoff * 2
        }
    }
}

// Catch uncaught exceptions
window.addEventListener('error', displayError)