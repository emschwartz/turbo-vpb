
document.getElementById('settings')
    .addEventListener('input', (event) => {
        const messageTemplates = []
        if (document.getElementById('messageText1').value) {
            messageTemplates.push({
                label: document.getElementById('messageLabel1').value || 'First Message',
                message: document.getElementById('messageText1').value,
                result: document.getElementById('messageResultTexted1').checked ? 'Texted' : null
            })
        }
        if (document.getElementById('messageText2').value) {
            messageTemplates.push({
                label: document.getElementById('messageLabel2').value || 'Second Message',
                message: document.getElementById('messageText2').value,
                result: document.getElementById('messageResultTexted2').checked ? 'Texted' : null
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
                if (messageTemplates[0].result === 'Texted') {
                    document.getElementById('messageResultTexted1').checked = true
                }
            }
            if (messageTemplates && messageTemplates.length >= 2) {
                document.getElementById('messageLabel2').value = messageTemplates[1].label
                document.getElementById('messageText2').value = messageTemplates[1].message
                if (messageTemplates[1].result === 'Texted') {
                    document.getElementById('messageResultTexted2').checked = true
                }
            }
        }
    })