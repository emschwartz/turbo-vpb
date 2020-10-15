const OPENVPB_REGEX = /https\:\/\/(www\.)?openvpb\.com/i
const EVERYACTION_REGEX = /https\:\/\/.*\.(everyaction|ngpvan)\.com/i
const VOTEBUILDER_REGEX = /https\:\/\/(www\.)?votebuilder.com/i
const BLUEVOTE_REGEX = /https\:\/\/.*\.bluevote.com/i
const STARTTHEVAN_REGEX = /https\:\/\/(www\.)?startthevan.com/i

const OPENVPB_ORIGIN = 'https://www.openvpb.com/VirtualPhoneBank*'
const EVERYACTION_ORIGIN = 'https://*.everyaction.com/ContactDetailScript*'
const VOTEBUILDER_ORIGIN = 'https://www.votebuilder.com/ContactDetailScript*'
const BLUEVOTE_ORIGIN = 'https://phonebank.bluevote.com/*'
const STARTTHEVAN_ORIGIN = 'https://www.startthevan.com/ContactDetailScript*'

let isEnabled = false
let canEnable = false
let shouldShowQrCode = false
let siteName
let origin
let activeTabId
let firstRender = true

onOpen().catch(console.error)
document.getElementById('toggleOnSite').addEventListener('click', toggleOnSite)
document.getElementById('openOptions').addEventListener('click', async () => {
    await browser.runtime.openOptionsPage()
    window.close()
})
document.getElementById('toggleOnSite').addEventListener('mouseenter', hoverToggleSite)
document.getElementById('toggleOnSite').addEventListener('mouseleave', resetStatusLook)
document.getElementById('showQrCode').addEventListener('click', showQrCode)
if (/firefox/i.test(navigator.userAgent)) {
    document.getElementById('webStoreLink').setAttribute('href', 'https://addons.mozilla.org/en-US/firefox/addon/turbovpb/')
}

async function onOpen() {
    console.log('popup opened')
    const [{ statsStartDate, totalCalls = '0' }, [activeTab], permissions] = await Promise.all([
        browser.storage.local.get([
            'statsStartDate',
            'totalCalls'
        ]),
        browser.tabs.query({
            active: true,
            currentWindow: true
        }),
        browser.permissions.getAll()
    ])
    browser.storage.onChanged.addListener((changes) => {
        if (changes.totalCalls) {
            showTotalCalls(changes.totalCalls.newValue)
        }
    })

    // Display stats
    if (statsStartDate) {
        const date = new Date(statsStartDate)
        document.getElementById('statsStartDate').innerText = `${date.getMonth() + 1}/${date.getDate()}`
    }

    showTotalCalls(totalCalls)

    if (activeTab) {
        activeTabId = activeTab.id

        if (activeTab.url) {
            console.log('Current tab URL:', activeTab.url)

            if (OPENVPB_REGEX.test(activeTab.url)) {
                canEnable = true
                siteName = 'OpenVPB'
                origin = OPENVPB_ORIGIN
                isEnabled = permissions.origins.some((o) => OPENVPB_REGEX.test(o))
                shouldShowQrCode = /VirtualPhoneBank\/.+/i.test(activeTab.url)
            } else if (VOTEBUILDER_REGEX.test(activeTab.url)) {
                canEnable = true
                siteName = 'VoteBuilder'
                origin = VOTEBUILDER_ORIGIN
                isEnabled = permissions.origins.some((o) => VOTEBUILDER_REGEX.test(o))
                shouldShowQrCode = /ContactDetailScript/i.test(activeTab.url)
            } else if (BLUEVOTE_REGEX.test(activeTab.url)) {
                canEnable = true
                siteName = 'BlueVote'
                origin = BLUEVOTE_ORIGIN
                isEnabled = permissions.origins.some((o) => BLUEVOTE_REGEX.test(o))
                shouldShowQrCode = true
            } else if (EVERYACTION_REGEX.test(activeTab.url)) {
                // TODO request permission for specific subdomain
                canEnable = true
                siteName = 'VAN'
                origin = EVERYACTION_ORIGIN
                isEnabled = permissions.origins.some((o) => EVERYACTION_REGEX.test(o))
                shouldShowQrCode = /ContactDetailScript/i.test(activeTab.url)
            } else if (STARTTHEVAN_REGEX.test(activeTab.url)) {
                canEnable = true
                siteName = 'StartTheVAN'
                origin = STARTTHEVAN_ORIGIN
                isEnabled = permissions.origins.some((o) => STARTTHEVAN_REGEX.test(o))
                shouldShowQrCode = /ContactDetailScript/i.test(activeTab.url)
            } else if (await siteIsVanWithCustomDomain(activeTabId)) {
                canEnable = true
                siteName = 'This Site'
                const url = new URL(activeTab.url)
                origin = `${url.protocol}//${url.host}/ContactDetailScript*`
                isEnabled = permissions.origins.includes(origin)
                shouldShowQrCode = /ContactDetailScript/i.test(activeTab.url)
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

function showTotalCalls(totalCalls) {
    document.getElementById('numCalls').innerText = `${totalCalls} Call${totalCalls !== '1' ? 's' : ''}`
    if (totalCalls === '0') {
        document.getElementById('encouragement').innerText = 'Login to a phone bank to get started'
    } else {
        document.getElementById('encouragement').innerText = 'Keep up the great work!'
    }
}

function hoverToggleSite() {
    if (!canEnable) {
        return
    }

    if (isEnabled) {
        document.getElementById('statusText').innerText = 'Click To Disable'
        document.getElementById('iconEnabled').setAttribute('hidden', true)
        document.getElementById('iconPause').removeAttribute('hidden')
        document.getElementById('statusIcon').classList.remove('text-dark', 'text-success')
        document.getElementById('statusIcon').classList.add('text-danger')
        document.getElementById('toggleOnSite').title = `Click To Disable TurboVPB on ${siteName}`
    } else {
        document.getElementById('statusText').innerText = 'Click To Enable'
        // document.getElementById('iconDisabled').removeAttribute('hidden')
        // document.getElementById('iconDisabled').setAttribute('hidden', true)
        document.getElementById('statusIcon').classList.remove('text-dark', 'text-danger')
        document.getElementById('statusIcon').classList.add('text-success')
        document.getElementById('toggleOnSite').title = `Click To Enable TurboVPB on ${siteName}`
    }
}

function resetStatusLook() {
    if (!canEnable) {
        document.getElementById('toggleOnSite').removeAttribute('href')
        document.getElementById('showQrCode').removeAttribute('href')
        return
    }
    document.getElementById('iconUnavailable').setAttribute('hidden', true)
    document.getElementById('iconPause').setAttribute('hidden', true)

    if (isEnabled) {
        document.getElementById('statusText').innerText = `Enabled On ${siteName}`
        document.getElementById('iconEnabled').removeAttribute('hidden')
        document.getElementById('iconDisabled').setAttribute('hidden', true)

    } else {
        document.getElementById('statusText').innerText = 'Click To Enable' // `Disabled on ${siteName}`
        document.getElementById('iconEnabled').setAttribute('hidden', true)
        document.getElementById('iconDisabled').removeAttribute('hidden')

        if (firstRender) {
            document.getElementById('iconDisabled').classList.add('glow')
            document.getElementById('statusText').classList.add('glow')
            setTimeout(() => {
                document.getElementById('iconDisabled').classList.remove('glow')
                document.getElementById('statusText').classList.remove('glow')
            }, 2500)
        }
    }

    if (isEnabled && shouldShowQrCode) {
        document.getElementById('showQrCode').setAttribute('href', '#')
        document.getElementById('showQrCode').classList.replace('text-muted', 'text-dark')
    } else {
        document.getElementById('showQrCode').removeAttribute('href')
        document.getElementById('showQrCode').classList.replace('text-dark', 'text-muted')
    }

    document.getElementById('statusIcon').classList.remove('text-success', 'text-danger')
    document.getElementById('statusIcon').classList.add('text-dark')

    firstRender = false
}

async function toggleOnSite() {
    if (!canEnable) {
        return
    }

    try {
        const backgroundPage = await browser.runtime.getBackgroundPage()

        if (!isEnabled) {
            console.log('requesting permission for:', origin)
            let permissionGranted
            permissionGranted = await browser.permissions.request({
                origins: [origin],
                permissions: []
            })

            // Save origin as enabled
            if (permissionGranted) {
                console.log('permission granted')
                const backgroundPage = await browser.runtime.getBackgroundPage()
                await backgroundPage.enableOrigin(origin)

                isEnabled = true

                console.log('injecting content scripts')
                const contentScripts = backgroundPage.getContentScripts(origin)
                for (let script of contentScripts) {
                    await browser.tabs.executeScript(script)
                }
                await browser.tabs.insertCSS({ file: 'dependencies/tingle.css' })
                console.log('injected content scripts into current page')
                await showQrCode()
            } else {
                console.log('permission denied')
            }

        } else {
            console.log('disabling origin:', origin)
            await backgroundPage.disableOrigin(origin)

            const wasRemoved = await browser.permissions.remove({
                origins: [origin]
            })
            console.log(`permission was ${wasRemoved ? '' : 'not '}removed`)

            isEnabled = false
        }
    } catch (err) {
        console.error(err)
    }

    resetStatusLook()
}

async function showQrCode() {
    if (!isEnabled || !shouldShowQrCode) {
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

// Use the presence of specific HTML elements to determine if the site is a VAN instance
async function siteIsVanWithCustomDomain(tabId) {
    return browser.tabs.executeScript(tabId, {
        code: `(document.querySelector('.van-header') || document.querySelector('.van-inner')) !== null`
    })
}