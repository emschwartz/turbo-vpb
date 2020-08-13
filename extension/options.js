console.log('options script loaded')

const EVERYACTION_ORIGIN = 'https://*.everyaction.com/ContactDetailScript*'
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
    .addEventListener('change', async (event) => {
        const backgroundPage = await browser.runtime.getBackgroundPage()
        try {
            if (event.target.checked) {
                const permissionGranted = await browser.permissions.request({
                    origins: [EVERYACTION_ORIGIN],
                    permissions: []
                })
                event.target.checked = permissionGranted
            }
        } catch (err) {
            console.error(err)
        }
    })
document.getElementById('enable-on-bluevote')
    .addEventListener('change', async (event) => {
        const backgroundPage = await browser.runtime.getBackgroundPage()
        try {
            if (event.target.checked) {
                const permissionGranted = await browser.permissions.request({
                    origins: [BLUEVOTE_ORIGIN],
                    permissions: []
                })
                if (permissionGranted) {
                    await backgroundPage.enableOrigin(BLUEVOTE_ORIGIN)
                }
                event.target.checked = permissionGranted
            } else {
                await backgroundPage.disableOrigin(BLUEVOTE_ORIGIN)
            }
        } catch (err) {
            console.error(err)
        }
    })

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
            if (enableOnOrigins.includes(BLUEVOTE_ORIGIN)) {
                document.getElementById('enable-on-bluevote')
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
    if (document.getElementById('enable-on-bluevote').checked) {
        enableOnOrigins.push(BLUEVOTE_ORIGIN)
    }

    return browser.storage.local.set({
        yourName: document.getElementById('yourName').value,
        messageTemplates,
        enableOnOrigins
    })
}