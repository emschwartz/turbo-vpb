const OPENVPB_ORIGIN = 'https://www.openvpb.com/VirtualPhoneBank*'
const EVERYACTION_ORIGIN = 'https://*.everyaction.com/ContactDetailScript*'
const VOTEBUILDER_ORIGIN = 'https://www.votebuilder.com/ContactDetailScript*'
const BLUEVOTE_ORIGIN = 'https://phonebank.bluevote.com/*'

const OPENVPB_REGEX = /https\:\/\/(www\.)?openvpb\.com/i
const EVERYACTION_REGEX = /https\:\/\/.*\.everyaction\.com\/ContactDetailScript/i
const VOTEBUILDER_REGEX = /https\:(www\.)?votebuilder.com/i
const BLUEVOTE_REGEX = /https\:phonebank.bluevote.com/i

let isEnabled = false
let canEnable = false
let siteName
let origin
let activeTabId

onOpen().catch(console.error)
document.getElementById('toggleOnSite').addEventListener('click', toggleOnSite)
document.getElementById('openOptions').addEventListener('click', async () => {
    await browser.runtime.openOptionsPage()
    window.close()
})
document.getElementById('toggleOnSite').addEventListener('mouseenter', hoverToggleSite)
document.getElementById('toggleOnSite').addEventListener('mouseleave', resetStatusLook)
document.getElementById('showQrCode').addEventListener('click', showQrCode)

async function onOpen() {
    const [{ enableOnOrigins = [] }, [activeTab]] = await Promise.all([
        browser.storage.local.get(['enableOnOrigins']),
        browser.tabs.query({
            active: true,
            currentWindow: true
        })
    ])

    if (activeTab) {
        activeTabId = activeTab.id

        if (activeTab.url) {
            console.log('Current tab URL:', activeTab.url)

            if (OPENVPB_REGEX.test(activeTab.url)) {
                canEnable = true
                siteName = 'OpenVPB'
                origin = OPENVPB_ORIGIN
                // TODO make OpenVPB optional?
                isEnabled = true
            } else if (VOTEBUILDER_REGEX.test(activeTab.url)) {
                canEnable = true
                siteName = 'VoteBuilder'
                origin = VOTEBUILDER_ORIGIN
                isEnabled = enableOnOrigins.includes(VOTEBUILDER_ORIGIN)
            } else if (BLUEVOTE_REGEX.test(activeTab.url)) {
                canEnable = true
                siteName = 'BlueVote'
                origin = BLUEVOTE_ORIGIN
                isEnabled = enableOnOrigins.includes(BLUEVOTE_ORIGIN)
            } else if (EVERYACTION_REGEX.test(activeTab.url)) {
                // TODO request permission for specific subdomain
                canEnable = true
                siteName = 'VAN'
                origin = EVERYACTION_ORIGIN
                isEnabled = enableOnOrigins.includes(EVERYACTION_ORIGIN)
            }
        }
    }

    if (isEnabled) {
        document.getElementById('toggleOnSite').setAttribute('href', '#')
        document.getElementById('toggleOnSite').classList.replace('text-muted', 'text-dark')
    } else if (canEnable) {
        document.getElementById('toggleOnSite').setAttribute('href', '#')
        document.getElementById('toggleOnSite').classList.replace('text-muted', 'text-dark')
    }
    resetStatusLook()
}

function hoverToggleSite() {
    if (!canEnable) {
        return
    }

    if (isEnabled) {
        document.getElementById('statusText').innerText = 'Click To Disable'
        document.getElementById('iconCheck').setAttribute('hidden', true)
        document.getElementById('iconCross').removeAttribute('hidden')
        document.getElementById('statusIcon').classList.remove('text-dark', 'text-success')
        document.getElementById('statusIcon').classList.add('text-danger')
    } else {
        document.getElementById('statusText').innerText = 'Click To Enable'
        document.getElementById('iconCheck').removeAttribute('hidden')
        document.getElementById('iconCross').setAttribute('hidden', true)
        document.getElementById('statusIcon').classList.remove('text-dark', 'text-danger')
        document.getElementById('statusIcon').classList.add('text-success')
    }
}

function resetStatusLook() {
    if (!canEnable) {
        document.getElementById('toggleOnSite').removeAttribute('href')
        document.getElementById('showQrCode').removeAttribute('href')
        return
    }
    if (isEnabled) {
        document.getElementById('statusText').innerText = `Enabled on ${siteName}`
        document.getElementById('iconCheck').removeAttribute('hidden')
        document.getElementById('iconCross').setAttribute('hidden', true)

        document.getElementById('showQrCode').setAttribute('href', '#')
        document.getElementById('showQrCode').classList.replace('text-muted', 'text-dark')
    } else {
        document.getElementById('statusText').innerText = `Disabled on ${siteName}`
        document.getElementById('iconCheck').setAttribute('hidden', true)
        document.getElementById('iconCross').removeAttribute('hidden')

        document.getElementById('showQrCode').removeAttribute('href')
        document.getElementById('showQrCode').classList.replace('text-dark', 'text-muted')
    }
    document.getElementById('statusIcon').classList.remove('text-success', 'text-danger')
    document.getElementById('statusIcon').classList.add('text-dark')
}

async function toggleOnSite() {
    if (!canEnable) {
        return
    }

    try {
        if (!isEnabled) {
            const alreadyEnabled = await browser.permissions.contains({ origins: [origin] })

            // Request permissions
            let permissionGranted = false
            if (!alreadyEnabled) {
                console.log('requesting permission for:', origin)
                permissionGranted = await browser.permissions.request({
                    origins: [origin],
                    permissions: []
                })
            }

            // Save origin as enabled
            if (alreadyEnabled || permissionGranted) {
                console.log('permission granted')
                const backgroundPage = await browser.runtime.getBackgroundPage()
                await backgroundPage.enableOrigin(origin)

                console.log('saving origin as enabled')
                const { enableOnOrigins = [] } = await browser.storage.local.get(['enableOnOrigins'])
                if (!enableOnOrigins.includes(origin)) {
                    await browser.storage.local.set({
                        enableOnOrigins: enableOnOrigins.concat([origin])
                    })
                }

                isEnabled = true
            } else {
                console.log('permission denied')
            }
        } else {
            console.log('disabling origin:', origin)
            const backgroundPage = await browser.runtime.getBackgroundPage()
            await backgroundPage.disableOrigin(origin)

            const { enableOnOrigins = [] } = await browser.storage.local.get(['enableOnOrigins'])
            console.log(enableOnOrigins)
            const originIndex = enableOnOrigins.indexOf(origin)
            if (originIndex !== -1) {
                console.log('saving origin as disabled')
                await browser.storage.local.set({
                    enableOnOrigins: enableOnOrigins.splice(originIndex, 1)
                })
            }

            isEnabled = false
        }
    } catch (err) {
        console.error(err)
    }

    resetStatusLook()
}

async function showQrCode() {
    if (!isEnabled) {
        return
    }
    try {
        await browser.tabs.sendMessage(activeTabId, {
            type: 'showQrCode'
        })
        window.close()
    } catch (err) {
        console.error(err)
    }
}