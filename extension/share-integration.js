console.log('Loaded share integration')

const DOWNLOAD_ICON = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-cloud-arrow-down-fill" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M8 2a5.53 5.53 0 0 0-3.594 1.342c-.766.66-1.321 1.52-1.464 2.383C1.266 6.095 0 7.555 0 9.318 0 11.366 1.708 13 3.781 13h8.906C14.502 13 16 11.57 16 9.773c0-1.636-1.242-2.969-2.834-3.194C12.923 3.999 10.69 2 8 2zm2.354 6.854l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7.5 9.293V5.5a.5.5 0 0 1 1 0v3.793l1.146-1.147a.5.5 0 0 1 .708.708z"/>
</svg>`
const UPLOAD_ICON = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-box-arrow-up-right" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
  <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
</svg>`
const SAVED_ICON = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-cloud-check" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383zm.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z"/>
  <path fill-rule="evenodd" d="M10.354 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7 8.793l2.646-2.647a.5.5 0 0 1 .708 0z"/>
</svg>`


const versionWarning = document.getElementById('version-gt-0-8-message')
if (versionWarning) {
    versionWarning.remove()
}

const importButton = document.getElementById('import-settings')
if (!importButton) {
    throw new Error('Import settings button does not exist')
}
importButton.removeAttribute('disabled')
importButton.addEventListener('click', async () => {
    const { messageTemplates } = parseSettings()
    const { messageTemplates: previousTemplates = [], yourName } = await browser.storage.local.get(['messageTemplates', 'yourName'])

    let shouldSave = false
    if (previousTemplates.length > 0) {
        shouldSave = await showConfirmationDialog(previousTemplates)
    } else {
        shouldSave = true
    }

    if (shouldSave) {
        await browser.storage.local.get({
            messageTemplates
        })

        importButton.classList.replace('btn-primary', 'btn-success')
        importButton.innerHTML = `<h3>${SAVED_ICON} &nbsp; Settings Saved</h3>`
        importButton.setAttribute('disabled', 'true')
    }
    // TODO make sure their name is filled out
})

function parseSettings() {
    const templateElements = document.getElementsByName('message-template')
    if (!templateElements || templateElements.length === 0) {
        // TODO display error
        console.error('No message templates found')
        return
    }

    const messageTemplates = []
    for (let i = 0; i < templateElements.length; i++) {
        const elem = templateElements[i]
        let label = elem.querySelector("[name='message-label']")
        label = label && label.innerText
        let message = elem.querySelector("[name='message-body']")
        message = message && message.innerText
        let sendTexted = elem.querySelector("[name='send-texted-result']")
        sendTexted = !!sendTexted && !!sendTexted.checked

        if (label && message) {
            messageTemplates.push({
                label,
                message,
                result: sendTexted ? 'Texted' : null
            })
        } else {
            console.warn('Invalid message template. Label:', label, 'Message:', message)
        }
    }

    return { messageTemplates }
}

async function showConfirmationDialog(previousTemplates) {
    console.log('showing confirmation dialog')
    return new Promise((resolve, reject) => {
        try {
            const modal = new tingle.modal({
                footer: true,
                closeMethods: ['overlay', 'button', 'escape'],
                closeLabel: 'Cancel',
                onClose: () => resolve(false)
            })

            modal.setContent(`
            <h3 class="alert-heading">Overwrite Current Settings?</h3>
            <p class="lead">You have ${previousTemplates.length} Text Message Template${previousTemplates.length > 1 ? 's' : ''} configured.<br>Do you want to overwrite your current settings?</p>

            <p class="lead mb-0">You can click below to export your current settings<br>and save the link to use them again later.</p>`)
            modal.addFooterBtn('Cancel', 'btn btn-secondary m-2', () => {
                resolve(false)
            })
            modal.addFooterBtn(`${DOWNLOAD_ICON} Overwrite Settings`, 'overwrite-settings-btn btn btn-warning my-2 mr-2 ml-auto', () => {
                console.log('Overwrite settings')
                resolve(true)
                modal.close()
            })
            modal.addFooterBtn(`${UPLOAD_ICON} &nbsp; Export Current Settings`, 'export-settings-btn btn btn-success my-2 mr-2 ml-auto', () => {
                window.open(createShareUrl(previousTemplates), '_blank')
                const overwriteButton = document.querySelector('.overwrite-settings-btn')
                if (overwriteButton) {
                    overwriteButton.classList.replace('btn-warning', 'btn-success')
                }
                document.querySelector('.export-settings-btn').remove()
            })
            modal.open()
        } catch (err) {
            reject(err)
        }
    })
}

function createShareUrl(messageTemplates) {
    return `https://turbovpb.com/share?messageTemplates=${encodeURIComponent(JSON.stringify(messageTemplates))}`
}
