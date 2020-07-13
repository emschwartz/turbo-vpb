console.log("Content script loaded")

// TODO get a better way to find these details
const checkForDetailsInterval = setInterval(getContactDetails, 50)
let firstName
let phoneNumber

function getContactDetails() {
    if (document.getElementById('contactName').innerText && document.getElementById('openvpbphonelink').innerText !== phoneNumber) {
        fullName = document.getElementById('contactName').innerText
        phoneNumber = document.getElementById('openvpbphonelink').innerText
    }
    if (!document.getElementById('turbovpbcontainer')) {
        createTurboVpbContainer()
    }
}

async function createTurboVpbContainer() {
    const { url } = await browser.storage.local.get(['url'])

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

        const qr = qrcode(0, 'H')
        qr.addData(url)
        qr.make()
        const qrLink = document.createElement('a')
        qrLink.href = url
        qrLink.target = '_blank'
        const qrPlaceholder = document.createElement('div')
        qrPlaceholder.innerHTML = qr.createSvgTag({
            cellSize: 5,
            margin: 1
        })
        qrLink.appendChild(qrPlaceholder)
        container.appendChild(qrLink)

        document.getElementById('openvpbsidebarcontainer').appendChild(container)
    } else {
        console.log('not creating TurboVPB container, no URL yet')
    }

}