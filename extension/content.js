console.log("Content script loaded")

// We set these colors manually instead of using the Bootstrap classes
// because OpenVPB overrides the default Bootstrap colors
const SUCCESS_COLOR = '#28a745'
const WARNING_COLOR = '#ffc107'

let modal
let alreadyConnected = false
let modalOpenedTime

// Initialize Stats
if (!window.sessionStorage.getItem('turboVpbCalls')) {
    window.sessionStorage.setItem('turboVpbCalls', '-1')
}
if (!window.sessionStorage.getItem('turboVpbSuccessfulCalls')) {
    window.sessionStorage.setItem('turboVpbSuccessfulCalls', '0')
}
if (!window.sessionStorage.getItem('turboVpbStartTime')) {
    window.sessionStorage.setItem('turboVpbStartTime', Date.now())
}
if (!window.sessionStorage.getItem('turboVpbLastContactLoadTime')) {
    window.sessionStorage.setItem('turboVpbLastContactLoadTime', Date.now())
}

createPeer()

browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'contactRequest') {
        console.log('got contact request from background')
        sendDetails()
    } else if (message.type === 'callResult') {
        markResult(message.result)
    } else if (message.type === 'peerConnected') {
        console.log('peer connected')
        window.sessionStorage.setItem('turboVpbHideModal', 'true')

        // If the user manually opened the QR code, don't hide it right away
        if (modal && modal.isOpen() && Date.now() - modalOpenedTime > 100) {
            console.log('closing qr code modal')
            modal.close()
        }
        alreadyConnected = true
        const badges = document.getElementsByClassName('turboVpbConnectionStatus')
        for (let connectionStatus of badges) {
            connectionStatus.innerText = 'Connected'
            connectionStatus.style = `color: #fff; background-color: ${SUCCESS_COLOR}`
        }
    } else if (message.type === 'peerDisconnected') {
        console.log('peer disconnected')
        const badges = document.getElementsByClassName('turboVpbConnectionStatus')
        for (let connectionStatus of badges) {
            connectionStatus.innerText = 'Not Connected'
            connectionStatus.style = `color: #000; background-color: ${WARNING_COLOR}`
        }
    } else if (message.type === 'showQrCode') {
        console.log('showing qr code')
        showModal()
    } else {
        console.warn('got unexpected message from background:', message)
    }
})

window.addEventListener('focus', () => {
    console.log('sending connect message to background to ensure peer is still connected')
    sendConnect()
})

if (!window.sessionStorage.getItem('turboVpbHideModal')) {
    // Only create the modal after the page is fully loaded
    const watchForReady = setInterval(() => {
        if (document.getElementById('turbovpbcontainer')) {
            clearInterval(watchForReady)
            showModal()
        }
    }, 50)
}

function showModal() {
    console.log('creating modal')
    modal = new tingle.modal({
        closeMethods: ['overlay', 'escape', 'button']
    })

    const modalContent = document.createElement('div')

    const modalTitle = createTitleElement()
    modalContent.appendChild(modalTitle)

    const modalBody = document.createElement('div')
    modalBody.style = 'margin-top: 1rem;'
    // modalTitle.className = 'modal-title'
    // modalBody.className = 'modal-body text-center pb-0'
    const label = document.createElement('p')
    label.innerHTML = 'Scan the QR code with your phone\'s <br> default camera app to start TurboVPB:'
    label.style = 'text-align: center;'
    modalBody.appendChild(label)

    const qrCode = createQrCode({ height: '50vh', width: '50vh' })
    qrCode.style = 'max-height: 500px; max-width: 500px'
    modalBody.appendChild(qrCode)

    modalContent.appendChild(modalBody)

    modal.setContent(modalContent)
    modal.open()

    modalOpenedTime = Date.now()
}

function createQrCode({ backgroundColor = '#fff', height = '30vh', width = '30vh' } = {}) {
    const url = window.sessionStorage.getItem('turboVpbUrl')
    if (url) {
        const container = document.createElement('div')
        const qrLink = document.createElement('a')
        qrLink.href = url
        qrLink.target = '_blank'
        const qrCode = kjua({
            render: 'svg',
            text: url,
            crisp: true,
            rounded: 80,
            quiet: 0,
            back: backgroundColor
        })
        qrCode.style = `width: 100%; height: 100%; max-width: ${width}; max-height: ${height}`
        qrLink.appendChild(qrCode)
        container.appendChild(qrLink)
        return container

    } else {
        console.log('not creating TurboVPB QR Code, no URL yet')
    }
}

function createTitleElement(tag = 'div') {
    const title = document.createElement(tag)
    title.style = 'display: flex; align-items: center;'
    title.innerHTML = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-telephone-outbound-fill"
                fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd"
                    d="M2.267.98a1.636 1.636 0 0 1 2.448.152l1.681 2.162c.309.396.418.913.296 1.4l-.513 2.053a.636.636 0 0 0 .167.604L8.65 9.654a.636.636 0 0 0 .604.167l2.052-.513a1.636 1.636 0 0 1 1.401.296l2.162 1.681c.777.604.849 1.753.153 2.448l-.97.97c-.693.693-1.73.998-2.697.658a17.471 17.471 0 0 1-6.571-4.144A17.47 17.47 0 0 1 .639 4.646c-.34-.967-.035-2.004.658-2.698l.97-.969zM11 .5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V1.707l-4.146 4.147a.5.5 0 0 1-.708-.708L14.293 1H11.5a.5.5 0 0 1-.5-.5z" />
                </svg>`
    const name = document.createElement('span')
    name.style = 'padding-left:.3rem; padding-right: .3rem; padding-top: .1rem; font-size: 1.17em; font-weight: bold; color: #000;'
    name.innerText = 'TurboVPB'
    title.appendChild(name)
    const badge = createConnectionStatusBadge()
    title.appendChild(badge)
    return title
}

function createConnectionStatusBadge() {
    // const container = document.createElement('span')
    // container.className = 'align-middle mx-1'
    const badge = document.createElement('span')

    badge.className = 'turboVpbConnectionStatus badge px-1'

    if (alreadyConnected) {
        badge.innerText = 'Connected'
        badge.style = `font-weight: bold; color: #fff; background-color: ${SUCCESS_COLOR}`
    } else {
        badge.innerText = 'Waiting for Connection'
        badge.style = `font-weight: bold; color: #000; background-color: ${WARNING_COLOR}`
    }

    // container.appendChild(badge)
    return badge
}

async function createPeer() {
    let peerId = window.sessionStorage.getItem('turboVpbPeerId')

    if (!peerId) {
        const array = new Uint8Array(16)
        crypto.getRandomValues(array)
        peerId = [...array].map(byte => byte.toString(16).padStart(2, '0')).join('')
        window.sessionStorage.setItem('turboVpbPeerId', peerId)
    }

    console.log('using peerId:', peerId)

    // This uses half of a SHA-256 hash of the peerId as a session ID
    // The session ID is currently used only to ensure that the mobile browser
    // reloads the tab if you open a different link (the tab will not be reloaded
    // if only the hash changes)
    const peerIdArray = [...peerId].reduce((result, char, index, array) => {
        if (index % 2 === 0) {
            result.push(parseInt(array.slice(index, index + 2).join(''), 16))
        }
        return result
    }, [])
    const peerIdHashArray = new Uint8Array(await window.crypto.subtle.digest('SHA-256', Uint8Array.from(peerIdArray)))
    const peerIdHash = [...peerIdHashArray].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const sessionId = peerIdHash.slice(0, 16)

    const version = browser.runtime.getManifest().version
    const userAgent = encodeURIComponent(navigator.userAgent)
    const url = `https://turbovpb.com/connect?session=${sessionId}&version=${version}&userAgent=${userAgent}#${peerId}`
    window.sessionStorage.setItem('turboVpbUrl', url)

    sendConnect()
}

function isNewContact(phone) {
    return !window.sessionStorage.getItem('turboVpbPhoneNumber') || window.sessionStorage.getItem('turboVpbPhoneNumber') !== phone
}

async function handleContact(fullName, phone) {
    console.log('got new contact', fullName, phone)

    const callsThisSession = parseInt(window.sessionStorage.getItem('turboVpbCalls') || '0') + 1

    window.sessionStorage.setItem('turboVpbPhoneNumber', phone)
    window.sessionStorage.setItem('turboVpbFirstName', fullName.split(' ')[0])
    window.sessionStorage.setItem('turboVpbLastName', fullName.split(' ').slice(1).join(' '))
    window.sessionStorage.setItem('turboVpbCalls', callsThisSession)
    window.sessionStorage.setItem('turboVpbLastContactLoadTime', Date.now())

    await sendDetails()

    if (callsThisSession > 0) {
        await saveCall()
    }
}

async function sendConnect() {
    try {
        await browser.runtime.sendMessage({
            type: 'connect',
            peerId: window.sessionStorage.getItem('turboVpbPeerId')
        })
    } catch (err) {
        console.error(err)
    }
}

async function sendDetails() {
    console.log('sending details')
    let { yourName, messageTemplates } = await browser.storage.local.get(['yourName', 'messageTemplates'])
    if (typeof messageTemplates === 'string') {
        messageTemplates = JSON.parse(messageTemplates)
    }
    try {
        await browser.runtime.sendMessage({
            type: 'contact',
            peerId: window.sessionStorage.getItem('turboVpbPeerId'),
            data: {
                domain: window.location.href,
                messageTemplates,
                yourName,
                contact: {
                    phoneNumber: window.sessionStorage.getItem('turboVpbPhoneNumber'),
                    firstName: window.sessionStorage.getItem('turboVpbFirstName'),
                    lastName: window.sessionStorage.getItem('turboVpbLastName'),
                },
                stats: {
                    calls: parseInt(window.sessionStorage.getItem('turboVpbCalls')),
                    successfulCalls: parseInt(window.sessionStorage.getItem('turboVpbSuccessfulCalls')),
                    lastContactLoadTime: parseInt(window.sessionStorage.getItem('turboVpbLastContactLoadTime')),
                    startTime: parseInt(window.sessionStorage.getItem('turboVpbStartTime'))
                }
            }
        })
        console.log('sent contact')
    } catch (err) {
        console.error('error sending contact details', err)
    }
}

async function saveCall() {
    // TODO save call start time, duration, and result
    let { totalCalls = '0' } = await browser.storage.local.get(['totalCalls'])
    totalCalls = parseInt(totalCalls)
    totalCalls += 1
    console.log(`saving call (total calls made: ${totalCalls})`)
    await browser.storage.local.set({
        totalCalls
    })
}
