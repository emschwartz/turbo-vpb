console.log('using openvpb-specific content script')

let couldntReachContact = false

setInterval(getContactDetails, 50)

window.addEventListener('beforeunload', async () => {
    await browser.runtime.sendMessage({
        type: 'disconnect',
        peerId: window.sessionStorage.getItem('turboVpbPeerId')
    })
})

function couldntReachButton() {
    return document.getElementById('displaycontactresultsbutton')
        || document.getElementById('displayContactResultsButton')
}

function saveNextButton() {
    return document.getElementById('openvpbsavenextbutton')
        || document.getElementById('openVpbSaveNextButton')
        || document.getElementById('contactresultssavenextbutton')
        || document.getElementById('contactResultsSaveNextButton')
}

function getContactDetails() {
    // Create TurboVPB Container
    if (!document.getElementById('turbovpbcontainer')) {
        const sidebarContainer = document.getElementById('openvpbsidebarcontainer') || document.getElementById('openVpbSideBarContainer')
        if (sidebarContainer) {
            const qrCode = createQrCode('#f8f9fa')
            if (qrCode) {
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

                container.appendChild(qrCode)
                sidebarContainer.appendChild(container)
            }
        }
    }

    // Find phone number
    const currentPhoneNumber = (document.getElementById('openVpbPhoneLink')
        || document.getElementById('openvpbphonelink')
        || Array.from(document.getElementsByTagName('a')).find((a) => a.href.startsWith('tel:'))
        || {}).innerText

    const contactName = document.getElementById('contactName').innerText

    // Figure out if this is a new contact
    if (contactName && isNewContact(currentPhoneNumber)) {
        couldntReachContact = false

        // Determine if they couldn't reach the contact
        if (couldntReachButton()) {
            couldntReachButton().addEventListener('click', () => {
                couldntReachContact = true

                const cancelButton = document.getElementById('contactresultscancelbutton') || document.getElementById('contactResultsCancelButton')
                cancelButton.addEventListener('click', () => {
                    couldntReachContact = false
                })
            })
        }

        // Log successful calls
        if (saveNextButton()) {
            saveNextButton().addEventListener('click', () => {
                if (!couldntReachContact) {
                    console.log('logged successful call')
                    window.sessionStorage.setItem('turboVpbSuccessfulCalls', parseInt(window.sessionStorage.getItem('turboVpbSuccessfulCalls') || 0) + 1)
                }
            })
        }

        handleContact(
            contactName,
            currentPhoneNumber
        )
    }
}

function markResult(result) {
    const resultCode = result.toLowerCase()
    try {
        couldntReachButton().click()
        for (let radioUnit of document.querySelectorAll('li.radio-unit')) {
            if (resultCode === radioUnit.querySelector('.radio-label').innerText.toLowerCase()) {
                radioUnit.querySelector('input[type="radio"]').click()
                setTimeout(() => saveNextButton().click(), 1)
                return
            }
        }
        console.warn('Result code not found:', result)
    } catch (err) {
        console.error(err)
    }
}
