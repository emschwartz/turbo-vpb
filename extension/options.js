console.log('options script loaded')

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

document.getElementById('settings').addEventListener('input', saveSettings)

browser.storage.local.get(['yourName', 'messageTemplates', 'hideInfo'])
    .then(({ yourName, messageTemplates, hideInfo }) => {
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
    return browser.storage.local.set({
        yourName: document.getElementById('yourName').value,
        messageTemplates
    })
}