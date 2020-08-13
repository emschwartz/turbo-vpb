console.log("Content script loaded")

window.turboVpb = {
    peerId: null,
    contact: null,
    stats: {
        // Start at -1 because it will count contacts loaded (rather than calls completed)
        calls: -1,
        successfulCalls: 0,
        startTime: Date.now(),
        lastContactLoadTime: Date.now()
    }
}

createPeer()

browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'contactRequest') {
        console.log('got contact request from background')
        sendDetails()
    } else if (message.type === 'callResult') {
        markResult(message.result)
    }
})

window.addEventListener('focus', () => {
    if (Date.now() - lastContactLoadTime > 600000) {
        console.log('sending connect message to background to ensure peer is still connected')
        sendConnect()
    }
})

function createQrCode(backgroundColor) {
    const url = window.sessionStorage.getItem('url')
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
            // size: width || 240,
            rounded: 60,
            quiet: 0,
            back: backgroundColor || undefined
        })
        qrCode.style = 'width: 100%; height: 100%; max-width: 400px; max-height: 400px'
        qrLink.appendChild(qrCode)
        container.appendChild(qrLink)
        return container

    } else {
        console.log('not creating TurboVPB QR Code, no URL yet')
    }
}

async function createPeer() {
    window.turboVpb.peerId = window.sessionStorage.getItem('peerId')

    if (!window.turboVpb.peerId) {
        const array = new Uint8Array(16)
        crypto.getRandomValues(array)
        window.turboVpb.peerId = [...array].map(byte => byte.toString(16).padStart(2, '0')).join('')
        window.sessionStorage.setItem('peerId', window.turboVpb.peerId)
    }

    console.log('using peerId:', window.turboVpb.peerId)

    // This uses half of a SHA-256 hash of the peerId as a session ID
    // The session ID is currently used only to ensure that the mobile browser
    // reloads the tab if you open a different link (the tab will not be reloaded
    // if only the hash changes)
    const peerIdArray = [...window.turboVpb.peerId].reduce((result, char, index, array) => {
        if (index % 2 === 0) {
            result.push(parseInt(array.slice(index, index + 2).join(''), 16))
        }
        return result
    }, [])
    const peerIdHashArray = new Uint8Array(await window.crypto.subtle.digest('SHA-256', Uint8Array.from(peerIdArray)))
    const peerIdHash = [...peerIdHashArray].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const sessionId = peerIdHash.slice(0, 16)

    const url = `https://turbovpb.com/connect?session=${sessionId}#${window.turboVpb.peerId}`
    window.sessionStorage.setItem('url', url)

    sendConnect()
}

function isNewContact(phone) {
    return !window.turboVpb.contact || window.turboVpb.contact.phoneNumber !== phone
}

function handleContact(fullName, phone) {
    console.log('got new contact', fullName, phone)

    window.turboVpb.contact = {
        phoneNumber: phone,
        firstName: fullName.split(' ')[0],
        lastName: fullName.split(' ').slice(1).join(' ')
    }
    window.turboVpb.stats.calls += 1
    window.turboVpb.stats.lastContactLoadTime = Date.now()

    sendDetails()
}

async function sendConnect() {
    try {
        await browser.runtime.sendMessage({
            type: 'connect',
            peerId: window.turboVpb.peerId
        })
    } catch (err) {
        console.err(err)
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
            peerId: window.turboVpb.peerId,
            data: {
                messageTemplates,
                yourName,
                contact: window.turboVpb.contact,
                stats: window.turboVpb.stats
            }
        })
    } catch (err) {
        console.error(err)
    }
    console.log('sent contact')
}
