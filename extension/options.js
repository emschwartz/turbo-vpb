console.log('options script loaded')

const EVERYACTION_ORIGIN = 'https://*.everyaction.com/ContactDetailScript*'
const VOTEBUILDER_ORIGIN = 'https://www.votebuilder.com/ContactDetailScript*'
const BLUEVOTE_ORIGIN = 'https://phonebank.bluevote.com/*'

const messageContainer = document.getElementById('messages')
const messageTemplateHtml = document.getElementById('message-template')
let messageIndex = 0

document.getElementById('hide-info').addEventListener('click', () => {
    document.getElementById('install-info').setAttribute('hidden', 'true')
    return browser.storage.local.set({
        hideInfo: true
    })
})
document.getElementById('add-message-template')
    .addEventListener('click', (event) => {
        event.preventDefault()
        addMessageTemplate({
            label: '',
            message: '',
            result: null
        })
    })

document.getElementById('enable-on-everyaction')
    .addEventListener('change', handleOriginCheckboxChange.bind(null, EVERYACTION_ORIGIN)
    )
document.getElementById('enable-on-votebuilder')
    .addEventListener('change', handleOriginCheckboxChange.bind(null, VOTEBUILDER_ORIGIN)
    )
document.getElementById('enable-on-bluevote')
    .addEventListener('change', handleOriginCheckboxChange.bind(null, BLUEVOTE_ORIGIN)
    )
async function handleOriginCheckboxChange(origin, event) {
    try {
        if (event.target.checked) {
            console.log('requesting permission for:', origin)
            const permissionGranted = await browser.permissions.request({
                origins: [origin],
                permissions: []
            })
            if (permissionGranted) {
                const backgroundPage = await browser.runtime.getBackgroundPage()
                await backgroundPage.enableOrigin(origin)
            } else {
                console.log('permission denied')
            }
            event.target.checked = permissionGranted
        } else {
            const backgroundPage = await browser.runtime.getBackgroundPage()
            await backgroundPage.disableOrigin(origin)
        }
    } catch (err) {
        console.error(err)
    }
}

document.getElementById('settings').addEventListener('change', saveSettings)

browser.storage.local.get(['yourName', 'messageTemplates', 'hideInfo', 'enableOnOrigins'])
    .then(({ yourName, messageTemplates, hideInfo, enableOnOrigins }) => {
        if (yourName) {
            document.getElementById('yourName').value = yourName
        }
        if (typeof messageTemplates === 'string') {
            // For backwards compatibility
            messageTemplates = JSON.parse(messageTemplates)
            browser.storage.local.set({
                messageTemplates
            })
        }
        if (messageTemplates && messageTemplates.length > 0) {
            messageTemplates.forEach(addMessageTemplate)
        } else {
            addMessageTemplate({
                label: '',
                message: ''
            })
        }

        if (!hideInfo) {
            document.getElementById('install-info').removeAttribute('hidden')
        }

        if (enableOnOrigins) {
            if (enableOnOrigins.includes(EVERYACTION_ORIGIN)) {
                document.getElementById('enable-on-everyaction').checked = true
            }
            if (enableOnOrigins.includes(VOTEBUILDER_ORIGIN)) {
                document.getElementById('enable-on-votebuilder').checked = true
            }
            if (enableOnOrigins.includes(BLUEVOTE_ORIGIN)) {
                document.getElementById('enable-on-bluevote').checked = true
            }
        }
    })

function addMessageTemplate(template) {
    if (!template) {
        return
    }
    const { label, message, result } = template
    const id = `message-template-${messageIndex++}`

    const messageTemplateNode = messageTemplateHtml.content.firstElementChild.cloneNode(true)
    messageTemplateNode.id = id
    messageTemplateNode.querySelector('.message-template-label').value = label
    messageTemplateNode.querySelector('.message-template-message').value = message
    messageTemplateNode.querySelector('.message-template-result-texted').checked = result === 'Texted'
    messageTemplateNode.querySelector('.close').addEventListener('click', (event) => {
        event.preventDefault()
        document.getElementById(id).remove()
        saveSettings()
    })
    messageContainer.appendChild(messageTemplateNode)
}
function saveSettings() {
    console.log('saving settings')
    const messageTemplates = []
    for (let elem of document.getElementsByClassName('message-template')) {
        const label = elem.querySelector('.message-template-label').value
        if (label) {
            messageTemplates.push({
                label,
                message: elem.querySelector('.message-template-message').value,
                result: elem.querySelector('.message-template-result-texted').checked ? 'Texted' : null
            })
        }
    }
    const enableOnOrigins = []
    if (document.getElementById('enable-on-everyaction').checked) {
        enableOnOrigins.push(EVERYACTION_ORIGIN)
    }
    if (document.getElementById('enable-on-votebuilder').checked) {
        enableOnOrigins.push(VOTEBUILDER_ORIGIN)
    }
    if (document.getElementById('enable-on-bluevote').checked) {
        enableOnOrigins.push(BLUEVOTE_ORIGIN)
    }

    return browser.storage.local.set({
        yourName: document.getElementById('yourName').value,
        messageTemplates,
        enableOnOrigins
    })
}