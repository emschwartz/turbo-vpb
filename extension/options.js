
document.getElementById('settings')
    .addEventListener('input', (event) => {
        const messageTemplates = []
        if (document.getElementById('messageText1').value) {
            messageTemplates.push({
                label: document.getElementById('messageLabel1').value || 'First Message',
                message: document.getElementById('messageText1').value
            })
        }
        if (document.getElementById('messageText2').value) {
            messageTemplates.push({
                label: document.getElementById('messageLabel2').value || 'Second Message',
                message: document.getElementById('messageText2').value
            })
        }
        browser.storage.local.set({
            yourName: document.getElementById('yourName').value,
            messageTemplates: JSON.stringify(messageTemplates)
        })
    })
browser.storage.local.get(['yourName', 'messageTemplates', 'url'])
    .then(({ yourName, messageTemplates, url }) => {
        if (yourName) {
            document.getElementById('yourName').value = yourName
        }
        if (messageTemplates) {
            messageTemplates = JSON.parse(messageTemplates)
            if (messageTemplates && messageTemplates.length >= 1) {
                document.getElementById('messageLabel1').value = messageTemplates[0].label
                document.getElementById('messageText1').value = messageTemplates[0].message
            }
            if (messageTemplates && messageTemplates.length >= 2) {
                document.getElementById('messageLabel2').value = messageTemplates[1].label
                document.getElementById('messageText2').value = messageTemplates[1].message
            }
        }
    })