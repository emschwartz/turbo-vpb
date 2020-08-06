console.log("Content script loaded")

let firstName
let lastName
let phoneNumber
let peerId
let connections = {}
let stats = {
    // Start at -1 because it will count contacts loaded (rather than calls completed)
    calls: -1,
    successfulCalls: 0,
    startTime: Date.now(),
    lastContactLoadTime: Date.now()
}

// TODO get a better way to find these details
setInterval(getContactDetails, 50)
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

window.addEventListener('beforeunload', async () => {
    await browser.runtime.sendMessage({
        type: 'disconnect',
        peerId
    })
})

function getContactDetails() {
    if (!document.getElementById('turbovpbcontainer')) {
        createTurboVpbContainer()
    }

    if (document.getElementById('contactName')
        && document.getElementById('openvpbphonelink')
        && document.getElementById('openvpbphonelink').innerText !== phoneNumber) {
        console.log('new contact')

        document.getElementById('openvpbsavenextbutton').addEventListener('click', () => {
            console.log('logged successful call')
            stats.successfulCalls += 1
        })

        handleContact(
            document.getElementById('contactName').innerText,
            document.getElementById('openvpbphonelink').innerText
        )

    }
}

function createTurboVpbContainer() {
    if (!document.getElementById('openvpbsidebarcontainer')) {
        return
    }

    const url = window.sessionStorage.getItem('url')

    if (url) {
        const container = document.createElement('div')
        container.id = "turbovpbcontainer"
        container.style = "margin-top: 2rem"
        container.className = "openvpb-sidebar-content"
        container.appendChild(document.createElement('hr'))

        const title = document.createElement('h3')
        title.innerHTML = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-telephone-outbound-fill"
                fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd"
                    d="M2.267.98a1.636 1.636 0 0 1 2.448.152l1.681 2.162c.309.396.418.913.296 1.4l-.513 2.053a.636.636 0 0 0 .167.604L8.65 9.654a.636.636 0 0 0 .604.167l2.052-.513a1.636 1.636 0 0 1 1.401.296l2.162 1.681c.777.604.849 1.753.153 2.448l-.97.97c-.693.693-1.73.998-2.697.658a17.471 17.471 0 0 1-6.571-4.144A17.47 17.47 0 0 1 .639 4.646c-.34-.967-.035-2.004.658-2.698l.97-.969zM11 .5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V1.707l-4.146 4.147a.5.5 0 0 1-.708-.708L14.293 1H11.5a.5.5 0 0 1-.5-.5z" />
            </svg> TurboVPB`
        title.style = "margin-top: 2rem"
        container.appendChild(title)

        const label = document.createElement('p')
        label.innerText = 'Scan the QR code with your phone to start TurboVPB:'
        container.appendChild(label)

        const qrLink = document.createElement('a')
        qrLink.href = url
        qrLink.target = '_blank'
        const qrWidth = (document.querySelector('.openvpb-sidebar-content') && document.querySelector('.openvpb-sidebar-content').clientWidth) || 240
        const qrCode = kjua({
            render: 'svg',
            text: url,
            crisp: true,
            size: qrWidth,
            rounded: 60,
            quiet: 0,
            back: '#f8f9fa'
        })
        qrCode.style = 'width: 100%; height: 100%; max-width: 400px; max-height: 400px'
        qrLink.appendChild(qrCode)
        container.appendChild(qrLink)

        document.getElementById('openvpbsidebarcontainer').appendChild(container)
    } else {
        console.log('not creating TurboVPB container, no URL yet')
    }

}

async function createPeer() {
    peerId = window.sessionStorage.getItem('peerId')

    if (!peerId) {
        const array = new Uint8Array(16)
        crypto.getRandomValues(array)
        peerId = [...array].map(byte => byte.toString(16).padStart(2, '0')).join('')
        window.sessionStorage.setItem('peerId', peerId)
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

    const url = `https://turbovpb.com/connect?session=${sessionId}#${peerId}`
    window.sessionStorage.setItem('url', url)

    sendConnect()
}

function handleContact(fullName, phone) {
    console.log('got new contact')

    phoneNumber = phone
    firstName = fullName.split(' ')[0]
    lastName = fullName.split(' ').slice(1).join(' ')
    window.sessionStorage
    stats.calls += 1
    stats.lastContactLoadTime = Date.now()

    sendDetails()
}

async function sendConnect() {
    try {
        await browser.runtime.sendMessage({
            type: 'connect',
            peerId
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
            peerId,
            data: {
                messageTemplates,
                yourName,
                contact: {
                    firstName,
                    lastName,
                    phoneNumber
                },
                stats
            }
        })
    } catch (err) {
        console.error(err)
    }
    console.log('sent contact')
}

function markResult(result) {
    const resultCode = result.toLowerCase()
    try {
        document.getElementById('displaycontactresultsbutton').click()
        for (let radioUnit of document.getElementsByClassName('contact-results')[0].childNodes.values()) {
            if (resultCode === radioUnit.getElementsByClassName('radio-label')[0].innerText.toLowerCase()) {
                radioUnit.getElementsByClassName('radio')[0].click()
                document.getElementById('contactresultssavenextbutton').click()
                return
            }
        }
        console.warn('Result code not found:', result)
    } catch (err) {
        console.error(err)
    }
}