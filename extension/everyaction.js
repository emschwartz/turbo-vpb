console.log('using everyaction-specific content script')
const DESIGNATED_CONTACT_REGEX = /designated[ _-]?contact/i

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

function getResultCodes() {
    const button = couldntReachButton()
    if (!button) {
        console.error('Could not find Could Not Reach button')
        return
    }
    button.click()

    const resultCodes = []
    const elements = document.getElementsByClassName('script-result')
    if (!elements) {
        console.error('Could not find result codes')
        return
    }
    for (let i = 0; i < elements.length; i++) {
        resultCodes.push(elements[i].innerText)
    }
    console.log('determined result codes to be:', resultCodes)
    document.getElementById('cancel-has-made-contact').click()

    window.sessionStorage.setItem('turboVpbResultCodes', JSON.stringify(resultCodes))
}

function getContactDetails() {
    // Create TurboVPB Container
    if (!document.getElementById('turbovpbcontainer')) {
        const gridElements = document.getElementsByClassName('grid-half')
        if (gridElements && gridElements.length > 0) {
            const qrCode = createQrCode()
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

                const title = createTitleElement()
                title.className = 'panel-heading panel-heading-narrow page-section-heading'
                panelContent.appendChild(title)

                panelContent.appendChild(qrCode)
                gridElements[0].appendChild(container)
            }
        }
    }

    if (!window.sessionStorage.getItem('turboVpbResultCodes')) {
        getResultCodes()
    }

    // Find phone number
    const currentPhoneNumber = ((document.getElementById('current-number') && document.getElementById('current-number').firstElementChild)
        || Array.from(document.getElementsByTagName('a'))
            .find((a) => a.href.startsWith('tel:') && !DESIGNATED_CONTACT_REGEX.test(a.parentElement.id) && !DESIGNATED_CONTACT_REGEX.test(a.parentElement.parentElement.id))
        || {}).innerText

    const contactName = (document.querySelector('.person-phone-panel')
        && document.querySelector('.person-phone-panel').firstElementChild.innerText.replace(/ [–-] \d+(?:\s+\w)?/, ''))
        || null

    const additionalFields = {}
    if (document.getElementById('spanTableAdditionalInfo')) {
        for (const inputUnit of document.getElementById('spanTableAdditionalInfo').querySelectorAll('.input-unit').values()) {
            const label = inputUnit.querySelector('label, .input-label')
            const value = inputUnit.querySelector('.form-control, div')
            if (label && value) {
                additionalFields[label.innerText] = value.innerText
            }
        }
    }

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
            saveNextButton().addEventListener('click', async () => {
                if (couldntReachContact) {
                    // TODO save actual result
                    await saveCall('NotContacted')
                } else {
                    await saveCall('Contacted')
                }
            })
        } else {
            console.warn('could not find the Save & Next Call button')
        }

        handleContact(
            contactName,
            currentPhoneNumber,
            additionalFields
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

