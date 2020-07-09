console.log('Background script loaded')

// TODO more intelligent interval
setInterval(pingHeroku, 5000)

function pingHeroku() {
    window.fetch('https://turbovpb-peerjs-server.herokuapp.com')
}

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
    const peer = new Peer(id, {
        host: 'turbovpb-peerjs-server.herokuapp.com',
        // port: 443,
        secure: true,
        // debug: 3
    })
    peer.on('error', console.error)
    peer.on('close', () => console.log('close'))
    await browser.storage.local.set({ url: `http://192.168.0.182:8080/#${id}` })
    return peer
}

getPeerId()
    .then(createPeer)
    .then((peer) => {
        let phoneNumber
        let firstName
        const connections = {}

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
            browser.storage.local.get(['yourName', 'messageTemplates'])
                .then(({ yourName, messageTemplates }) => {
                    if (conn.open) {
                        conn.send({
                            // TODO only send on change
                            messageTemplates: JSON.parse(messageTemplates),
                            yourName,
                            contact: {
                                firstName,
                                phoneNumber
                            }
                        })
                    } else {
                        conn.once('open', () => sendDetails(conn))
                    }
                })
        }


        function handleContact(contact) {
            if (phoneNumber === contact.preferredPhone) {
                return
            }

            phoneNumber = contact.preferredPhone
            firstName = contact.targets[0].targetPerson.salutation

            for (let conn of Object.values(connections)) {
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