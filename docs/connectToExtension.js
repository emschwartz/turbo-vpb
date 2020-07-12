let messageTemplates = []
let yourName = ''

let peer
let conn

let lastTimeCheck

const remotePeerId = window.location.hash.slice(1)
if (remotePeerId) {
    connectToExtension()
} else {
    document.getElementById('mainContainer').setAttribute('hidden', true)
    document.getElementById('warningContainer').removeAttribute('hidden')
}

function connectToExtension() {
    connectPeer()

    // Based on https://stackoverflow.com/a/35215953
    // this uses multiple methods to detect when the page may have been
    // put to sleep by the browser and then reopened
    window.addEventListener('focus', connectPeer)
    window.addEventListener('pageshow', connectPeer)
    document.addEventListener('visibilitychange', connectPeer)

    lastTimeCheck = Date.now()
    setInterval(() => {
        if (Date.now() - lastTimeCheck > 5000) {
            connectPeer()
        }
        lastTimeCheck = Date.now()
    }, 500)
}

function setStatus(status, alertType) {
    if (document.readyState === 'complete') {
        const statusElement = document.getElementById('status')
        statusElement.innerText = `Status: ${status}`
        statusElement.className = statusElement.className.replace(/alert-\w+/, `alert-${alertType}`)
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

function connectPeer() {
    if (!peer || peer.destroyed) {
        setStatus('Connecting to server...', 'warning')
        console.log('creating new peer')
        peer = new Peer({
            // host: 'peerjs.turbovpb.com',
            host: 'turbovpb-peerjs-server.herokuapp.com',
            secure: true,
            // debug: 3
        })
        peer.on('disconnect', connectPeer)
        peer.on('error', (err) => {
            console.error(err)
            setStatus('Error (Cannot connect to extension. Try re-opening the QR code or link from the extension.)', 'danger')
        })
        peer.once('open', () => {
            opened = true
            establishConnection()
        })
    } else if (peer.disconnected) {
        setStatus('Not connected', 'warning')
        console.log('peer was disconnected')
        peer.reconnect()
        peer.once('open', () => {
            opened = true
            establishConnection()
        })
    }
}

function establishConnection() {
    console.log('establish connection')
    if (conn && conn.open) {
        console.log('connection already good')
        setStatus('Connected', 'success')
        return
    }

    setStatus('Connecting to extension...', 'warning')
    conn = peer.connect(remotePeerId, {
        serialization: 'json'
    })
    conn.once('open', () => {
        console.log('connection open')
        setStatus('Connected', 'success')
    })
    conn.once('error', (err) => {
        console.error(err)
        conn = null
        setStatus(`Error (${err.message})`, 'danger')
    })
    conn.once('close', () => {
        setStatus('Not Connected', 'danger')

        conn = null
        setTimeout(() => {
            establishConnection()
        }, 1000)
    })
    conn.on('data', (data) => {
        console.log('got data', data)
        if (data.yourName) {
            yourName = data.yourName
        }
        if (data.messageTemplates) {
            messageTemplates = data.messageTemplates
        }
        if (data.contact) {
            document.getElementById('contactDetails').hidden = false
            document.getElementById('instructions').hidden = true

            console.log(data.contact)
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
            for (let { label, message } of messageTemplates) {
                const a = document.createElement('a')
                a.className = "btn btn-outline-secondary btn-block p-2 h2"
                a.role = 'button'
                a.target = "_blank"
                const messageBody = message
                    .replace(/\[their name\]/i, data.contact.firstName)
                    .replace(/\[your name\]/i, yourName)
                a.href = `sms://${phoneNumber}?&body=${messageBody}`
                a.innerText = `Send ${label}`
                textMessageLinks.appendChild(a)
            }
            document.getElementById('phoneNumber').click()
        }
    })
}