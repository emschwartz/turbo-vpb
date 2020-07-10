let messageTemplates = {}
let yourName = ''

let peer
let conn

const remotePeerId = window.location.hash.slice(1)
if (remotePeerId) {
    connectToExtension()
} else {
    document.getElementById('mainContainer').setAttribute('hidden', true)
    document.getElementById('warningContainer').removeAttribute('hidden')
}

function connectToExtension() {
    connectPeer()
    window.addEventListener('focus', () => {
        console.log('window focused')
        connectPeer()
    })
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
            host: 'turbovpb-peerjs-server.herokuapp.com',
            // port: 9000,
            secure: true,
            // debug: 3
        })
        peer.on('disconnect', connectPeer)
        peer.on('error', (err) => {
            console.error(err)
            connectPeer()
        })
        peer.once('open', establishConnection)
    }
    if (peer.disconnected) {
        console.log('peer was disconnected')
        peer.reconnect()
        peer.once('open', establishConnection)
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
        }
    })
}