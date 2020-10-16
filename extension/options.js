console.log('options script loaded')

const messageContainer = document.getElementById('messages')
const messageTemplateHtml = document.getElementById('message-template')
let messageIndex = 0

document.getElementById('add-message-template')
    .addEventListener('click', (event) => {
        event.preventDefault()
        addMessageTemplate({
            label: '',
            message: '',
            result: null
        })
    })

document.getElementById('settings').addEventListener('change', saveSettings)

browser.storage.local.get(['yourName', 'messageTemplates'])
    .then(({ yourName, messageTemplates }) => {
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
        if (messageContainer.childElementCount === 0) {
            addMessageTemplate({
                label: '',
                message: ''
            })
        }
    })
    messageContainer.appendChild(messageTemplateNode)
}
function saveSettings() {
    console.log('saving settings')
    const messageTemplates = []
    const elements = document.getElementsByClassName('message-template')
    for (let i = 0; i < elements.length; i++) {
        const elem = elements[i]
        const message = elem.querySelector('.message-template-message').value
        if (message) {
            const label = elem.querySelector('.message-template-label')
            if (!label.value) {
                label.value = `Message ${i + 1}`
            }
            messageTemplates.push({
                label: label.value,
                message,
                result: elem.querySelector('.message-template-result-texted').checked ? 'Texted' : null
            })
        }
    }

    return browser.storage.local.set({
        yourName: document.getElementById('yourName').value,
        messageTemplates
    })
}