console.log('Background script loaded')

const messageTemplates = [
    'Hello [Their Name]',
    'Sorry I missed you [Their Name]'
]

async function getPeerId() {
    let { peerId } = await browser.storage.local.get('peerId')

    if (!peerId) {
        const array = new Uint8Array(16)
        crypto.getRandomValues(array)
        peerId = base64url.encode(array)
        console.log('Using new peerId:', peerId)
        await browser.storage.local.set({ peerId })
    }

    return peerId
}

async function createPeer(id) {
    console.log(`http://localhost:8080/#${id}`)
    const peer = new Peer(id, {
        host: 'localhost',
        port: 9000,
        // port: 443,
        // secure: true,
        debug: 3
    })
    peer.on('error', console.error)
    peer.on('close', () => console.log('close'))
    return peer
}

getPeerId()
    .then(createPeer)
    .then((peer) => {
        let phoneNumber
        let firstName

        peer.on('connection', (conn) => {
            console.log('got connection')
            conn.on('open', () => {
                if (phoneNumber) {
                    sendDetails(conn)
                }
            })
            conn.on('close', () => console.log('connection closed'))
        })

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
                const response = JSON.parse(responseString)
                handleContact(response)
                filter.disconnect()
            }

            return {};
        }

        function sendDetails(conn) {
            console.log('sending details')
            conn.send({
                // TODO only send on change
                messageTemplates,
                contact: {
                    firstName,
                    phoneNumber
                }
            })
        }


        function handleContact(contact) {
            if (phoneNumber === contact.preferredPhone) {
                return
            }

            phoneNumber = contact.preferredPhone.match(/\d+/g).join('')
            firstName = contact.targets[0].targetPerson.salutation

            for (let conns of Object.values(peer.connections)) {
                const conn = conns[0]
                if (conn.open) {
                    sendDetails(conn)
                }
            }
        }

        browser.webRequest.onBeforeRequest.addListener(
            contactApiListener,
            {
                urls: ["https://api.securevan.com/*/nextTarget*"],
                types: ["xmlhttprequest"]
            },
            ["blocking"]
        );
    })