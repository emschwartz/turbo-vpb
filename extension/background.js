const peers = {}

browser.runtime.onMessage.addListener((message, sender) => {
    if (typeof message !== 'object') {
        console.log('got message that was not an object', message)
        return
    }

    if (message.type === 'connect') {
        const peerId = message.peerId
        createPeer(peerId, sender.tab.id)
    } else if (message.type === 'contact') {
        const peerId = message.peerId
        createPeer(peerId, sender.tab.id)

        const connections = Object.values(peers[peerId].connections)
        for (let conn of connections) {
            console.log('sending contact to peer', peerId)
            if (conn && conn.open) {
                conn.send(message.data)
            } else {
                conn.once('open', () => {
                    conn.send(message.data)
                })
            }
        }
        if (connections.length === 0) {
            console.log('not sending contact because there is no open connection for peer', peerId)
        }
    } else if (message.type === 'disconnect') {
        const peerId = message.peerId
        if (!peers[peerId]) {
            return
        }
        if (peers[peerId].tabId !== sender.tab.id) {
            console.warn(`got disconnect message for peer ${peerId} from unexpected tab. expected: ${peers[peerId].tabId}, actual: ${sender.tab.id}`)
            return
        }
        console.log(`destroying peer ${peerId} because tab ${sender.tab.id} was closed`)
        if (peers[peerId]) {
            peers[peerId].peer.destroy()
        }
        delete peers[peerId]
    } else {
        console.log('got unexpected message', message)
    }
})

function createPeer(peerId, tabId) {
    if (peers[peerId] && !peers[peerId].destroyed && !peers[peerId].disconnected) {
        if (peers[peerId].tabId !== tabId) {
            console.log(`peer ${peerId} is now in tab ${tabId}`)
            peers[peerId].tabId = tabId
        }

        // TODO reconnect
        return
    }

    console.log(`creating peer ${peerId} for tab ${tabId}`)

    // Note that PeerJS peers are created in the background script instead
    // of in the content_script because loading the peerjs.js script as
    // part of the content_script caused an error. It complained about the
    // webrtc-adapter peerjs is using internally trying to set a read-only property
    const peer = new Peer(peerId, {
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

    peers[peerId] = {
        peer,
        tabId,
        connections: []
    }

    peer.on('open', () => console.log(`peer ${peerId} listening for connections`))
    peer.on('error', (err) => {
        delete peers[peerId]
        console.error(err)
    })
    peer.on('close', () => {
        delete peers[peerId]
        console.log(`peer ${peerId} closed`)
    })

    peer.on('connection', async (conn) => {
        console.log(`peer ${peerId} got connection`)
        peers[peerId].connections.push(conn)
        const connIndex = peers[peerId].connections.length - 1
        conn.on('close', () => {
            console.log(`peer ${peerId} connection closed`)
            delete peers[peerId].connections[connIndex]
        })
        conn.on('error', (err) => {
            console.log(`peer ${peerId} connection error`, err)
            delete peers[peerId].connections[connIndex]
        })
        if (conn.serialization === 'json') {
            conn.on('data', async (message) => {
                if (message.type === 'callResult') {
                    console.log(`peer ${peerId} sent call result:`, message)
                    try {
                        await browser.tabs.sendMessage(peers[peerId].tabId, {
                            type: 'callResult',
                            result: message.result
                        })
                    } catch (err) {
                        console.error('Error sending call result to content_script', err)
                    }
                }
            })
        } else {
            console.warn(`Peer connection for peerId ${peerId} serialization should be json but it is: ${conn.serialization}`)
        }
        try {
            console.log('requesting contact from content script')
            await browser.tabs.sendMessage(peers[peerId].tabId, {
                type: 'contactRequest'
            })
        } catch (err) {
            console.error('Error sending contact request to content_script', err)
        }
    })
}

browser.runtime.onInstalled.addListener(({ reason, temporary }) => {
    if (temporary) {
        return
    }

    if (reason === 'install') {
        browser.runtime.openOptionsPage()
    }
})