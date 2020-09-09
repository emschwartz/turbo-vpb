console.log('using openvpb-specific content script')

let couldntReachContact = false

setInterval(getContactDetails, 50)

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
            const qrCode = createQrCode({ backgroundColor: '#f8f9fa' })
            if (qrCode) {
                const container = document.createElement('div')
                container.id = "turbovpbcontainer"
                container.style = "margin-top: 2rem"
                container.className = "openvpb-sidebar-content"

                const line = document.createElement('hr')
                line.style = 'margin-bottom: 2rem;'
                container.appendChild(line)

                const title = createTitleElement()
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

    const contactName = (document.getElementById('contactName') || {}).innerText

    // Figure out if this is a new contact
    if (contactName && currentPhoneNumber && isNewContact(currentPhoneNumber)) {
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
