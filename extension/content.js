console.log("Content script loaded")

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
        window.sessionStorage.setItem('turboVpbPeersConnected', parseInt(window.sessionStorage.getItem('turboVpbPeersConnected') || 0) + 1)
        $('#turbovpbModal').modal('hide')
    } else if (message.type === 'peerDisconnected') {
        console.log('peer disconnected')
        window.sessionStorage.setItem('turboVpbPeersConnected', parseInt(window.sessionStorage.getItem('turboVpbPeersConnected') || 0) - 1)
    }
})

window.addEventListener('focus', () => {
    const lastContactLoadTime = parseInt(window.sessionStorage.getItem('turboVpbLastContactLoadTime'))
    if (Date.now() - lastContactLoadTime > 600000) {
        console.log('sending connect message to background to ensure peer is still connected')
        sendConnect()
    }
})

if (!window.sessionStorage.getItem('turboVpbPeersConnected') || window.sessionStorage.getItem('turboVpbPeersConnected') === '0') {
    $(window).on('load', () => {

        console.log('creating modal')
        const modal = createModal()
        // Only create the modal after OpenVPB is fully loaded
        // TODO make this non-OpenVPB specific
        const checkForOpenVpb = setInterval(() => {
            if (document.getElementById('contactName')) {
                clearInterval(checkForOpenVpb)
                document.body.appendChild(modal)
                $('#turbovpbModal').modal()
                // Without this, the background displays in front of the modal
                // Based on answer from https://stackoverflow.com/questions/10636667/bootstrap-modal-appearing-under-background
                $('#turbovpbModal').css('z-index', '999999')
            }
        }, 50)
    })
}

function createModal() {
    const container = document.createElement('div')

    const modal = document.createElement('div')

    modal.className = 'modal'
    modal.setAttribute('tabindex', '-1')
    modal.setAttribute('role', 'dialog')
    modal.id = 'turbovpbModal'
    container.appendChild(modal)

    const modalDialog = document.createElement('div')
    modalDialog.className = 'modal-dialog modal-dialog-centered'
    modalDialog.setAttribute('role', 'document')
    modal.appendChild(modalDialog)

    const modalContent = document.createElement('div')
    modalContent.className = 'modal-content'
    modalDialog.appendChild(modalContent)

    const modalHeader = document.createElement('div')
    modalHeader.className = 'modal-header'
    modalContent.appendChild(modalHeader)

    const modalTitle = document.createElement('h5')
    modalTitle.className = 'modal-title'
    modalTitle.innerText = 'TurboVPB'
    modalHeader.appendChild(modalTitle)

    const closeButton = document.createElement('button')
    closeButton.className = 'close'
    closeButton.type = 'button'
    closeButton.setAttribute('data-dismiss', 'modal')
    closeButton.insertAdjacentHTML('afterbegin', '<span>&times;</span>')
    modalHeader.appendChild(closeButton)

    const modalBody = document.createElement('div')
    modalBody.className = 'modal-body'
    modalContent.appendChild(modalBody)

    const qrCode = createQrCode()
    modalBody.appendChild(qrCode)

    return container
}

function createQrCode(backgroundColor) {
    const url = window.sessionStorage.getItem('turboVpbUrl')
    if (url) {
        const container = document.createElement('div')
        const label = document.createElement('p')
        label.innerText = 'Scan the QR code with your phone to start TurboVPB:'
        container.appendChild(label)

        const qrLink = document.createElement('a')
        qrLink.href = url
        qrLink.target = '_blank'
        const qrCode = kjua({
            render: 'svg',
            text: url,
            crisp: true,
            rounded: 50,
            quiet: 0,
            back: backgroundColor || '#fff'
        })
        qrCode.style = 'width: 100%; height: 100%; max-width: 30vh; max-height: 30vh'
        qrLink.appendChild(qrCode)
        container.appendChild(qrLink)
        return container

    } else {
        console.log('not creating TurboVPB QR Code, no URL yet')
    }
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

function handleContact(fullName, phone) {
    console.log('got new contact', fullName, phone)

    window.sessionStorage.setItem('turboVpbPhoneNumber', phone)
    window.sessionStorage.setItem('turboVpbFirstName', fullName.split(' ')[0])
    window.sessionStorage.setItem('turboVpbLastName', fullName.split(' ').slice(1).join(' '))
    window.sessionStorage.setItem('turboVpbCalls', parseInt(window.sessionStorage.getItem('turboVpbCalls') || '0') + 1)
    window.sessionStorage.setItem('turboVpbLastContactLoadTime', Date.now())

    sendDetails()
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
