console.log("Content script loaded")

// We set these colors manually instead of using the Bootstrap classes
// because OpenVPB overrides the default Bootstrap colors
const SUCCESS_COLOR = '#28a745'
const WARNING_COLOR = '#ffc107'
const ERROR_COLOR = '#dc3545'

let modal
let isConnected = false
let modalOpenedTime
let resultCodes = null

// Initialize Stats
if (!window.sessionStorage.getItem('turboVpbCalls')) {
    window.sessionStorage.setItem('turboVpbCalls', '0')
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

let url
sendConnect()
    .then((newUrl) => url = newUrl)

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
        isConnected = true
        const badges = document.getElementsByClassName('turboVpbConnectionStatus')
        for (let connectionStatus of badges) {
            connectionStatus.innerText = 'Connected'
            connectionStatus.style = `color: #fff; background-color: ${SUCCESS_COLOR}`
        }
    } else if (message.type === 'peerDisconnected') {
        console.log('peer disconnected')
        isConnected = false
        const badges = document.getElementsByClassName('turboVpbConnectionStatus')
        for (let connectionStatus of badges) {
            connectionStatus.innerText = 'Not Connected'
            connectionStatus.style = `color: #000; background-color: ${WARNING_COLOR}`
        }
    } else if (message.type === 'peerError') {
        isConnected = false
        const badges = document.getElementsByClassName('turboVpbConnectionStatus')
        for (let connectionStatus of badges) {
            connectionStatus.innerText = 'Error. Close Tab & Re-Open.'
            connectionStatus.style = `color: #000; background-color: ${ERROR_COLOR}`
        }
    } else if (message.type === 'showQrCode') {
        console.log('showing qr code')
        showModal()
    } else {
        console.warn('got unexpected message from background:', message)
    }
})

window.addEventListener('focus', async () => {
    console.log('sending connect message to background to ensure peer is still connected')
    const newUrl = await sendConnect()
    if (url !== newUrl) {
        url = newUrl
        console.log(`URL changed to ${url}, updating QR code(s)`)

        const newQrCode = createQrCode()
        for (let elem of document.getElementsByClassName('turboVpbQrCode')) {
            elem.replaceWith(newQrCode.cloneNode(true))
        }
    }
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
    if (modal && modal.isOpen()) {
        console.log('modal is already open')
        return
    }
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
    if (url) {
        const container = document.createElement('div')
        container.classList.add('turboVpbQrCode')
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

    if (isConnected) {
        badge.innerText = 'Connected'
        badge.style = `font-weight: bold; color: #fff; background-color: ${SUCCESS_COLOR}`
    } else {
        badge.innerText = 'Waiting for Connection'
        badge.style = `font-weight: bold; color: #000; background-color: ${WARNING_COLOR}`
    }

    // container.appendChild(badge)
    return badge
}

function isNewContact(phone) {
    return !window.sessionStorage.getItem('turboVpbPhoneNumber') || window.sessionStorage.getItem('turboVpbPhoneNumber') !== phone
}

async function handleContact(fullName, phone, additionalFields) {
    console.log('got new contact', fullName, phone, additionalFields)

    window.sessionStorage.setItem('turboVpbPhoneNumber', phone)
    window.sessionStorage.setItem('turboVpbFirstName', fullName.split(' ')[0])
    window.sessionStorage.setItem('turboVpbLastName', fullName.split(' ').slice(1).join(' '))
    window.sessionStorage.setItem('turboVpbLastContactLoadTime', Date.now())

    if (additionalFields) {
        window.sessionStorage.setItem('turboVpbAdditionalFields', JSON.stringify(additionalFields))
    }

    await sendDetails()
}

async function sendConnect() {
    try {
        return browser.runtime.sendMessage({
            type: 'connect',
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
            data: {
                messageTemplates,
                yourName,
                contact: {
                    phoneNumber: window.sessionStorage.getItem('turboVpbPhoneNumber'),
                    firstName: window.sessionStorage.getItem('turboVpbFirstName'),
                    lastName: window.sessionStorage.getItem('turboVpbLastName'),
                    additionalFields: window.sessionStorage.getItem('turboVpbAdditionalFields') ? JSON.parse(window.sessionStorage.getItem('turboVpbAdditionalFields')) : undefined
                },
                stats: {
                    calls: parseInt(window.sessionStorage.getItem('turboVpbCalls')),
                    successfulCalls: parseInt(window.sessionStorage.getItem('turboVpbSuccessfulCalls')),
                    lastContactLoadTime: parseInt(window.sessionStorage.getItem('turboVpbLastContactLoadTime')),
                    startTime: parseInt(window.sessionStorage.getItem('turboVpbStartTime'))
                },
                callNumber: parseInt(window.sessionStorage.getItem('turboVpbCalls')),
                resultCodes: JSON.parse(window.sessionStorage.getItem('turboVpbResultCodes') || '[]'),
                lastCallResult: window.sessionStorage.getItem('turboVpbLastCallResult')
            }
        })
        console.log('sent contact')
    } catch (err) {
        console.error('error sending contact details', err)
    }
}

async function saveCall(result) {
    window.sessionStorage.setItem('turboVpbLastCallResult', result)
    if (result === 'Contacted') {
        console.log('logged successful call')
        window.sessionStorage.setItem('turboVpbSuccessfulCalls', parseInt(window.sessionStorage.getItem('turboVpbSuccessfulCalls') || 0) + 1)
    }
    const callsThisSession = parseInt(window.sessionStorage.getItem('turboVpbCalls') || '0')
    await browser.runtime.sendMessage({
        type: 'callResult',
        sessionId: window.sessionStorage.getItem('turboVpbSessionId'),
        callNumber: callsThisSession,
        result
    })

    window.sessionStorage.setItem('turboVpbCalls', callsThisSession + 1)
}
