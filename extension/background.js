console.log('Background script loaded')

let peer
let connections = {}
let phoneNumber
let firstName
let lastName

async function createPeer() {
    if (peer && !peer.disconnected) {
        console.log('peer already connected')
        return
    }

    let { peerId } = await browser.storage.local.get('peerId')

    if (!peerId) {
        const array = new Uint8Array(16)
        crypto.getRandomValues(array)
        peerId = base64url.encode(array)
        console.log('Using new peerId:', peerId)
        await browser.storage.local.set({ peerId })
    }

    console.log('creating peer')
    peer = new Peer(peerId, {
        // Note this uses the herokuapp domain because
        // configuring a custom domain with SSL requires
        // a paid plan.
        // Google Appengine does it for free but doesn't
        // support websockets on the standard environment.
        host: 'turbovpb-peerjs-server.herokuapp.com',
        // host: 'peerjs.turbovpb.com',
        path: '/',
        secure: true,
        // debug: 3
    })
    connections = {}

    peer.on('error', console.error)
    peer.on('close', () => console.log('close'))

    peer.on('connection', (conn) => {
        console.log('got connection')
        // conn.on('open', () => {
        connections[conn.id] = conn
        if (phoneNumber) {
            sendDetails(conn)
        } else {
            console.log('not sending contact')
        }
        // })
        conn.on('close', () => {
            console.log('connection closed')
            delete connections[conn.id]
        })
        conn.on('error', (err) => {
            console.log('connection error', err)
            delete connections[conn.id]
        })
    })

    await browser.storage.local.set({ url: `https://turbovpb.com/connect#${peerId}` })
}

function contactApiListener(details) {
    if (details.method !== 'GET') {
        return
    }
    let filter = browser.webRequest.filterResponseData(details.requestId);
    let decoder = new TextDecoder("utf-8");
    let responseString = ""

    filter.ondata = event => {
        responseString += decoder.decode(event.data, { stream: true })
        filter.write(event.data);
    }
    filter.onstop = event => {
        const contact = JSON.parse(responseString)
        filter.disconnect()
        if (phoneNumber === contact.preferredPhone) {
            return
        }
        console.log('got new contact')

        phoneNumber = contact.preferredPhone
        firstName = contact.targets[0].targetPerson.salutation
        lastName = contact.targets[0].targetPerson.lastName

        for (let conn of Object.values(connections)) {
            sendDetails(conn)
        }
    }

    return {};
}

function sendDetails(conn) {
    browser.storage.local.get(['yourName', 'messageTemplates'])
        .then(({ yourName, messageTemplates }) => {
            if (conn.open) {
                conn.send({
                    // TODO only send on change
                    messageTemplates: messageTemplates ? JSON.parse(messageTemplates) : null,
                    yourName,
                    contact: {
                        firstName,
                        lastName,
                        phoneNumber
                    }
                })
            } else {
                conn.once('open', () => sendDetails(conn))
            }
        })
}

createPeer()

browser.webRequest.onBeforeRequest.addListener(
    contactApiListener,
    {
        urls: ["https://api.securevan.com/*/nextTarget*"],
        types: ["xmlhttprequest"]
    },
    ["blocking"]
);

browser.webRequest.onBeforeRequest.addListener(
    createPeer,
    {
        urls: ["https://*.openvpb.com/*"],
        types: ["main_frame"]
    }
)