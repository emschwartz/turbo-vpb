console.log('using everyaction-specific content script')

let couldntReachContact = false

setInterval(getContactDetails, 50)

function couldntReachButton() {
    return document.getElementById('switch')
        || document.querySelector('button.btn.btn-warning')
}
function saveNextButton() {
    return document.getElementById('ctl00_ContentPlaceHolderVANPage_scriptSectionbtnSaveNextHH')
        || document.querySelector('input.btn[type="submit"]')
}

function getContactDetails() {
    // Create TurboVPB Container
    if (!document.getElementById('turbovpbcontainer')) {
        const gridElements = document.getElementsByClassName('grid-half')
        if (gridElements && gridElements.length > 0) {
            const qrCode = createQrCode('#fff')
            if (qrCode) {
                const container = document.createElement('div')
                container.id = 'turbovpbcontainer'
                container.className = 'col-lg-6 col-md-6 col-sm-12 margin-right-tiny'

                const panel = document.createElement('div')
                panel.className = 'panel panel-details panel-default'
                container.appendChild(panel)

                const panelContent = document.createElement('div')
                panelContent.className = 'panel-content'
                panel.appendChild(panelContent)

                const title = document.createElement('div')
                title.className = 'panel-heading panel-heading-narrow page-section-heading'
                title.innerHTML = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-telephone-outbound-fill"
                fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd"
                    d="M2.267.98a1.636 1.636 0 0 1 2.448.152l1.681 2.162c.309.396.418.913.296 1.4l-.513 2.053a.636.636 0 0 0 .167.604L8.65 9.654a.636.636 0 0 0 .604.167l2.052-.513a1.636 1.636 0 0 1 1.401.296l2.162 1.681c.777.604.849 1.753.153 2.448l-.97.97c-.693.693-1.73.998-2.697.658a17.471 17.471 0 0 1-6.571-4.144A17.47 17.47 0 0 1 .639 4.646c-.34-.967-.035-2.004.658-2.698l.97-.969zM11 .5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V1.707l-4.146 4.147a.5.5 0 0 1-.708-.708L14.293 1H11.5a.5.5 0 0 1-.5-.5z" />
            </svg> TurboVPB`
                panelContent.appendChild(title)

                panelContent.appendChild(qrCode)
                gridElements[0].appendChild(container)
            }
        }
    }

    // Find phone number
    const currentPhoneNumber = ((document.getElementById('current-number') && document.getElementById('current-number').firstElementChild)
        || Array.from(document.getElementsByTagName('a')).find((a) => a.href.startsWith('tel:'))
        || {}).innerText

    const contactName = (document.querySelector('.person-phone-panel')
        && document.querySelector('.person-phone-panel').firstElementChild.innerText.replace(/ [–-] \d+(?:\s+\w)?/, ''))
        || null

    // Figure out if this is a new contact
    if (contactName && currentPhoneNumber && isNewContact(currentPhoneNumber)) {
        couldntReachContact = false

        // Determine if they couldn't reach the contact
        if (couldntReachButton()) {
            couldntReachButton().addEventListener('click', () => {
                couldntReachContact = true

                const cancelButton = document.getElementById('cancel-has-made-contact')
                cancelButton.addEventListener('click', () => {
                    couldntReachContact = false
                })
            })
        } else {
            console.warn('could not find the I Couldn\'t Reach ___ button')
        }

        if (saveNextButton()) {
            // Log successful calls
            saveNextButton().addEventListener('click', () => {
                if (!couldntReachContact) {
                    console.log('logged successful call')
                    window.sessionStorage.setItem('turboVpbSuccessfulCalls', parseInt(window.sessionStorage.getItem('turboVpbSuccessfulCalls') || 0) + 1)
                }
            })
        } else {
            console.warn('could not find the Save & Next Call button')
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
        const textedResult = Array.from(document.querySelectorAll('input[name="resultCodeId"]'))
            .filter(node => node.parentNode.innerText.toLowerCase() === resultCode)[0]
        if (textedResult) {
            textedResult.click()
            setTimeout(() => saveNextButton().click(), 1)
        } else {
            console.warn('Result code not found:', result)
        }
    } catch (err) {
        console.error(err)
    }
}

