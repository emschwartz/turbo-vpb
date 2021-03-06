'use strict'

console.log('Loading connect.js')

/**
 * Constants
 */
const CONNECT_TIMEOUT = 15000
const WAIT_AFTER_PAGE_BECOMES_VISIBLE = 100
const THEIR_NAME_REGEX = /[\[\(\{<]+\s*(?:their|thier|there)\s*name\s*[\]\)\}>]+/ig
const YOUR_NAME_REGEX = /[\[\(\{<]+\s*(?:your|y[ou]r|you'?re|my)\s*name\s*[\]\)\}>]+/ig
const ADDITIONAL_FIELDS_REGEX = /[\[\(\{<]+(.+?)[\]\)\}>]+/g

/**
 * Icon SVGs
 */
const TEXT_MESSAGE_MARK_TEXTED_ICON = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-chat-text" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894zm-.493 3.905a21.682 21.682 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a9.68 9.68 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9.06 9.06 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105z"/>
  <path fill-rule="evenodd" d="M4 5.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zM4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8zm0 2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5z"/>
</svg>`

const TEXT_MESSAGE_ICON = `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-chat-dots" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894zm-.493 3.905a21.682 21.682 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a9.68 9.68 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9.06 9.06 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105z"/>
  <path d="M5 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
</svg>`

const CALL_RESULT_ICONS = {
    'Not Home': `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-house-door" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M7.646 1.146a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 .146.354v7a.5.5 0 0 1-.5.5H9.5a.5.5 0 0 1-.5-.5v-4H7v4a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .146-.354l6-6zM2.5 7.707V14H6v-4a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v4h3.5V7.707L8 2.207l-5.5 5.5z"/>
  <path fill-rule="evenodd" d="M13 2.5V6l-2-2V2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5z"/>
</svg>`,
    Refused: `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-hand-thumbs-down" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M6.956 14.534c.065.936.952 1.659 1.908 1.42l.261-.065a1.378 1.378 0 0 0 1.012-.965c.22-.816.533-2.512.062-4.51.136.02.285.037.443.051.713.065 1.669.071 2.516-.211.518-.173.994-.68 1.2-1.272a1.896 1.896 0 0 0-.234-1.734c.058-.118.103-.242.138-.362.077-.27.113-.568.113-.857 0-.288-.036-.585-.113-.856a2.094 2.094 0 0 0-.16-.403c.169-.387.107-.82-.003-1.149a3.162 3.162 0 0 0-.488-.9c.054-.153.076-.313.076-.465a1.86 1.86 0 0 0-.253-.912C13.1.757 12.437.28 11.5.28v1c.563 0 .901.272 1.066.56.086.15.121.3.121.416 0 .12-.035.165-.04.17l-.354.353.353.354c.202.202.407.512.505.805.104.312.043.44-.005.488l-.353.353.353.354c.043.043.105.141.154.315.048.167.075.37.075.581 0 .212-.027.415-.075.582-.05.174-.111.272-.154.315l-.353.353.353.354c.353.352.373.714.267 1.021-.122.35-.396.593-.571.651-.653.218-1.447.224-2.11.164a8.907 8.907 0 0 1-1.094-.17l-.014-.004H9.62a.5.5 0 0 0-.595.643 8.34 8.34 0 0 1 .145 4.725c-.03.112-.128.215-.288.255l-.262.066c-.306.076-.642-.156-.667-.519-.075-1.081-.239-2.15-.482-2.85-.174-.502-.603-1.267-1.238-1.977C5.597 8.926 4.715 8.23 3.62 7.93 3.226 7.823 3 7.534 3 7.28V3.279c0-.26.22-.515.553-.55 1.293-.138 1.936-.53 2.491-.869l.04-.024c.27-.165.495-.296.776-.393.277-.096.63-.163 1.14-.163h3.5v-1H8c-.605 0-1.07.08-1.466.217a4.823 4.823 0 0 0-.97.485l-.048.029c-.504.308-.999.61-2.068.723C2.682 1.815 2 2.434 2 3.279v4c0 .851.685 1.433 1.357 1.616.849.232 1.574.787 2.132 1.41.56.626.914 1.28 1.039 1.638.199.575.356 1.54.428 2.591z"/>
</svg>`,
    Busy: `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-clock" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm8-7A8 8 0 1 1 0 8a8 8 0 0 1 16 0z"/>
  <path fill-rule="evenodd" d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5z"/>
</svg>`,
    Deceased: `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-person-x" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6 5c0 1-1 1-1 1H1s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C9.516 10.68 8.289 10 6 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10zm1.146-7.85a.5.5 0 0 1 .708 0L14 6.293l1.146-1.147a.5.5 0 0 1 .708.708L14.707 7l1.147 1.146a.5.5 0 0 1-.708.708L14 7.707l-1.146 1.147a.5.5 0 0 1-.708-.708L13.293 7l-1.147-1.146a.5.5 0 0 1 0-.708z"/>
</svg>`,
    'Call Back': `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-arrow-repeat" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
  <path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
</svg>`,
    Moved: `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-truck" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M0 3.5A1.5 1.5 0 0 1 1.5 2h9A1.5 1.5 0 0 1 12 3.5V5h1.02a1.5 1.5 0 0 1 1.17.563l1.481 1.85a1.5 1.5 0 0 1 .329.938V10.5a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 1 1-4 0H5a2 2 0 1 1-3.998-.085A1.5 1.5 0 0 1 0 10.5v-7zm1.294 7.456A1.999 1.999 0 0 1 4.732 11h5.536a2.01 2.01 0 0 1 .732-.732V3.5a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .294.456zM12 10a2 2 0 0 1 1.732 1h.768a.5.5 0 0 0 .5-.5V8.35a.5.5 0 0 0-.11-.312l-1.48-1.85A.5.5 0 0 0 13.02 6H12v4zm-9 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm9 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>
</svg>`,
    'Left Message': `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-voicemail" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M7 8.5A3.49 3.49 0 0 1 5.95 11h4.1a3.5 3.5 0 1 1 2.45 1h-9A3.5 3.5 0 1 1 7 8.5zm-6 0a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0zm14 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
</svg>`,
    'Do Not': `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-x-octagon" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M4.54.146A.5.5 0 0 1 4.893 0h6.214a.5.5 0 0 1 .353.146l4.394 4.394a.5.5 0 0 1 .146.353v6.214a.5.5 0 0 1-.146.353l-4.394 4.394a.5.5 0 0 1-.353.146H4.893a.5.5 0 0 1-.353-.146L.146 11.46A.5.5 0 0 1 0 11.107V4.893a.5.5 0 0 1 .146-.353L4.54.146zM5.1 1L1 5.1v5.8L5.1 15h5.8l4.1-4.1V5.1L10.9 1H5.1z"/>
  <path fill-rule="evenodd" d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
</svg>`,
    Disconnected: `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-mic-mute" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M12.734 9.613A4.995 4.995 0 0 0 13 8V7a.5.5 0 0 0-1 0v1c0 .274-.027.54-.08.799l.814.814zm-2.522 1.72A4 4 0 0 1 4 8V7a.5.5 0 0 0-1 0v1a5 5 0 0 0 4.5 4.975V15h-3a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-3v-2.025a4.973 4.973 0 0 0 2.43-.923l-.718-.719zM11 7.88V3a3 3 0 0 0-5.842-.963l.845.845A2 2 0 0 1 10 3v3.879l1 1zM8.738 9.86l.748.748A3 3 0 0 1 5 8V6.121l1 1V8a2 2 0 0 0 2.738 1.86zm4.908 3.494l-12-12 .708-.708 12 12-.708.707z"/>
</svg>`,
    'Wrong Number': `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-telephone-minus" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328zM1.884.511a1.745 1.745 0 0 1 2.612.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.678.678 0 0 0 .178.643l2.457 2.457a.678.678 0 0 0 .644.178l2.189-.547a1.745 1.745 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.634 18.634 0 0 1-7.01-4.42 18.634 18.634 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877L1.885.511zM10 3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5z"/>
</svg>`,
    Gift: `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-gift" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M3 2.5a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 5 0v.006c0 .07 0 .27-.038.494H15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1v7.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 14.5V7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2.038A2.968 2.968 0 0 1 3 2.506V2.5zm1.068.5H7v-.5a1.5 1.5 0 1 0-3 0c0 .085.002.274.045.43a.522.522 0 0 0 .023.07zM9 3h2.932a.56.56 0 0 0 .023-.07c.043-.156.045-.345.045-.43a1.5 1.5 0 0 0-3 0V3zM1 4v2h6V4H1zm8 0v2h6V4H9zm5 3H9v8h4.5a.5.5 0 0 0 .5-.5V7zm-7 8V7H2v7.5a.5.5 0 0 0 .5.5H7z"/>
</svg>`,
    Other: `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-skip-forward" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M15.5 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V8.752l-6.267 3.636c-.52.302-1.233-.043-1.233-.696v-2.94l-6.267 3.636C.713 12.69 0 12.345 0 11.692V4.308c0-.653.713-.998 1.233-.696L7.5 7.248v-2.94c0-.653.713-.998 1.233-.696L15 7.248V4a.5.5 0 0 1 .5-.5zM1 4.633v6.734L6.804 8 1 4.633zm7.5 0v6.734L14.304 8 8.5 4.633z"/>
</svg>`,
    Texted: TEXT_MESSAGE_MARK_TEXTED_ICON,
}

/**
 * URL Parameters
 * (Some of these are used in the code, some are just used to tag errors sent to Sentry)
 */
const debugMode = window.location.href.includes('debug')
const searchParams = (new URL(window.location.href)).searchParams
const sessionId = searchParams.get('session') || ''
const extensionVersion = searchParams.get('version') || '<0.6.3'
const extensionUserAgent = searchParams.get('userAgent') || ''
const domain = searchParams.get('domain') || ''
const remotePeerId = window.location.hash.slice(1)
    .replace(/&.*/, '')
const encryptionKey = window.location.hash.slice(1)
    .replace(/[^&]*&/, '')
    .replace('&debug', '')
// The commit hash is included by Jekyll
const commitHash = document.querySelector('meta[name="commit-hash"]')
const release = commitHash && commitHash.content

// Fallback in case localStorage is unavailable
let storage
try {
    if (window.localStorage) {
        console.log('Using localStorage')
        storage = window.localStorage
    } else if (window.sessionStorage) {
        console.log('Using sessionStorage')
        storage = window.sessionStorage
    }
} catch (err) {
    console.warn('Error accessing local / window storage', err)
}
if (!storage) {
    console.log('Using in-memory storage')
    const memoryStore = {}
    storage = {
        setItem: (key, value) => memoryStore[key] = value,
        getItem: (key) => memoryStore[key]
    }
}

/**
 * Connection manager and timeout
 */
let peerManager
let connectTimer
let connectTimerIsRunning = false
let pageLastBecameVisible = Date.now()
let sessionComplete = false

/**
 * Contact data sent by the extension
 */
let messageTemplates = []
let phoneNumber
let firstName
let additionalFields
let yourName = ''
// resultCode -> number of times used
let resultCodesTimesUsed = {}
if (storage.getItem('resultCodes')) {
    try {
        resultCodesTimesUsed = JSON.parse(storage.getItem('resultCodes'))
    } catch (err) {
        console.error('Result codes is corrupted', err)
    }
}

/**
 * Call and session stats
 */
let startTime = Date.now() // this may be updated if the page was reloaded but continued a session started earlier
let sessionTimeInterval
let callNumber
let connectionsThisLoad = 0

/**
 * Last call details
 * (Used to send and display call results after the user comes back to this page)
 */
let lastCallStartTime
let lastCallDuration = 0
let lastCallResult
let pendingSaveMessage
let waitForNewContact = false // if true, only display contact details if it's a new phone number
let autoSaveTextedResultEnabled = true

/**
 * Analytics
 */
try {
    const tracker = ackeeTracker.create({
        server: 'https://analytics.turbovpb.com',
        domainId: 'ed7f1c2b-46bc-4858-8221-4b9133ac88ca'
    })

    const url = new URL(window.location.href)
    url.hash = ''
    const attributes = ackeeTracker.attributes(true)
    attributes.siteLocation = url.toString()

    const { stop: stopTracking } = tracker.record(attributes)
    window.addEventListener('beforeunload', () => stopTracking())
} catch (err) {
    console.error('error setting up tracking', err)
}

/**
 * Error Reporting
 */
let loadContactSpan
if (Sentry) {
    console.log('Re-initializing Sentry')

    Sentry.init({
        dsn: 'https://6c908d99b8534acebf2eeecafeb1614e@o435207.ingest.sentry.io/5393315',
        release,
        beforeBreadcrumb: (breadcrumb) => {
            if ((breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') &&
                breadcrumb.data &&
                (breadcrumb.data.url.startsWith('https://analytics.turbovpb.com' || breadcrumb.data.url.startsWith('https://stats.turbovpb.com')))) {
                return null
            } else {
                return breadcrumb
            }
        },
        // Performance sample
        tracesSampleRate: 0.01,
    });

    // Tag Sentry reports with various details about the session and extension
    // (The extension does not report additional details to Sentry so we rely
    // on details sent from the extension to this page to figure out if there's
    // an extension-related problem)
    Sentry.configureScope(function (scope) {
        scope.setUser({
            id: sessionId,
        })
        scope.setTag('extension_version', extensionVersion)
        scope.setTag('extension_useragent', extensionUserAgent)

        // Tag with browser and operating system
        if (/chrome/i.test(extensionUserAgent)) {
            scope.setTag('extension_browser', 'chrome')
        } else if (/firefox/i.test(extensionUserAgent)) {
            scope.setTag('extension_browser', 'firefox')
        }
        if (/windows/i.test(extensionUserAgent)) {
            scope.setTag('extension_os', 'windows')
        } else if (/mac/i.test(extensionUserAgent)) {
            scope.setTag('extension_os', 'mac')
        } else if (/linux|unix/i.test(extensionUserAgent)) {
            scope.setTag('extension_os', 'linux')
        }

        // This is the phone bank site the extension is being used on
        if (domain) {
            scope.setTag('domain', domain)
        }
        scope.setTag('debug_mode', debugMode)
    })
} else {
    console.error('Could not load Sentry')
}

window.addEventListener('error', displayError)

document.addEventListener('readystatechange', () => {
    // Log this because some errors seem to be caused by this script
    // being run before the page is actually ready
    // TODO: figure out why this is
    console.log('document readyState:', document.readyState)
})

// Start the connection timer so it shows an error if there is
// no contact loaded within a reasonable amount of time
restartConnectionTimeout()

// Either run the start function or wait until the page has fully loaded
if (document.readyState !== 'loading') {
    start().catch((err) => {
        displayError(err)
        console.log('reporting start error to Sentry')
        Sentry.captureException(err)
    })
} else {
    console.log('document not yet ready, waiting for start event')
    async function onLoad() {
        document.removeEventListener('load', onLoad)
        try {
            await start()
        } catch (err) {
            displayError(err)
            console.log('reporting start error to Sentry')
            Sentry.captureException(err)
        }
    }

    document.addEventListener('load', onLoad)
}

async function start() {
    showVersionRelatedMessages()

    // Connect to the extension if a remotePeerId is specified and the session isn't complete
    if (sessionIsComplete()) {
        markSessionComplete()
    } else if (!remotePeerId) {
        // Show error
        document.getElementById('main-container').setAttribute('hidden', true)
        document.getElementById('warning-container').removeAttribute('hidden')
    } else {
        // Create PeerManager and set up event handlers
        peerManager = await PeerManager.from({
            debugMode,
            remotePeerId,
            encryptionKey
        })
        if (Sentry && typeof Sentry.startTransaction === 'function') {
            loadContactSpan = Sentry.startTransaction({
                name: `${peerManager.mode}.loadFirstContact`,
                tags: {
                    connection_mode: peerManager.mode
                }
            })
        }
        peerManager.onconnect = () => {
            console.log('PeerManager.onconnect')
            setStatus('Connected', 'success')
            stopConnectionTimeout()

            const warningContainer = document.getElementById('warning-container')
            if (warningContainer) {
                warningContainer.setAttribute('hidden', 'true')
            }

            // Update session time
            if (!sessionTimeInterval) {
                sessionTimeInterval = setInterval(() => {
                    document.getElementById('session-time').innerText = msToTimeString(Date.now() - startTime)
                }, 1000)
            }

            // Track how many times the peer manager has connected this page load and this tab session
            connectionsThisLoad += 1
            let connectionsThisSession
            if (window.sessionStorage) {
                connectionsThisSession = parseInt(window.sessionStorage.getItem('connectionsThisSession') || 0) + 1
                window.sessionStorage.setItem('connectionsThisSession', connectionsThisSession)
            }
            if (Sentry) {
                Sentry.configureScope((scope) => {
                    scope.setTag('connections_this_load', connectionsThisLoad)
                    if (typeof connectionsThisSession === 'number') {
                        scope.setTag('connections_this_session', connectionsThisSession)
                    }
                })
            }

        }
        peerManager.onmessage = (data) => {
            stopConnectionTimeout() // we know we're connected if we got a message
            handleExtensionMessage(data)
        }
        peerManager.onreconnecting = (target) => {
            console.log('PeerManager.onreconnecting', target)
            if (sessionIsComplete()) {
                stopConnectionTimeout()
                console.log('Session is complete, stopping peer manager')
                peerManager.stop()
                return
            }

            setStatus(`Connecting to ${target || 'Extension'}`, 'warning')
            setLoading()

            // Don't start timer if it started reconnecting because the page is hidden
            // TODO: this event may fire after the page becomes visible again
            if (document.visibilityState !== 'hidden') {
                restartConnectionTimeout()
            }

            document.getElementById('warning-container').hidden = true
            document.getElementById('contact-details').hidden = true
        }
        peerManager.onerror = (err) => {
            console.log('PeerManager.onerror', err)

            // Only show and report errors if they are not caused by the page being put to sleep by the browser
            // The error event fires after the document.readyState is changed to visible, which is why
            // we check if the page became visible within a certain number of milliseconds
            if (document.visibilityState === 'hidden'
                || (Date.now() - pageLastBecameVisible) <= WAIT_AFTER_PAGE_BECOMES_VISIBLE) {
                return
            }

            displayError(err)

            if (err) {
                console.log('reporting peer error to Sentry')
                if (err.type) {
                    Sentry.captureException(err, {
                        tags: {
                            error_type: err.type
                        }
                    })
                } else {
                    Sentry.captureException(err)
                }
            }
        }

        peerManager.connect()

        /**
         * Event Listeners
         */

        // Estimate call duration
        // Start the timer either on click or on the touchstart event
        const callButton = document.getElementById('phone-number-link')
        callButton.addEventListener('click', (e) => {
            if (storage.getItem('requireLongPressMode')) {
                e.preventDefault()
                const longPressButton = document.getElementById('long-press-to-call')
                if (!longPressButton) {
                    console.error('cannot find long-press-to-call button')
                    return
                }
                callButton.setAttribute('hidden', 'true')
                longPressButton.removeAttribute('hidden')
                setTimeout(() => {
                    callButton.removeAttribute('hidden')
                    longPressButton.setAttribute('hidden', 'true')
                }, 800)

            } else {
                lastCallStartTime = Date.now()
            }
        })
        callButton.addEventListener('touchstart', () => {
            lastCallStartTime = Date.now()
        })

        // Require long-press mode setting
        // This is used on iPhones to allow people to only call with an app like Google Voice.
        // The setting disables the normal click so that the user can hold the button
        // to bring up the call options menu and select (Google) Voice from the list.
        if (/iphone|ipad|ios/i.test(navigator.userAgent) || storage.getItem('requireLongPressMode')) {
            const longPressSettings = document.getElementById('ios-long-press-mode')
            longPressSettings.removeAttribute('hidden')
            const checkbox = longPressSettings.querySelector('input[type="checkbox"]')
            if (storage.getItem('requireLongPressMode')) {
                checkbox.checked = true
            }
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    storage.setItem('requireLongPressMode', 'true')
                } else {
                    storage.removeItem('requireLongPressMode')
                }
            })
        } else if (/android/i.test(navigator.userAgent)) {
            document.getElementById('ios-long-press-mode').setAttribute('hidden', 'true')
            document.getElementById('android-google-voice').removeAttribute('hidden')
        }

        // This page is often hidden and then made visible again as users
        // switch to the phone or messaging app and then switch back to their browser
        document.addEventListener('visibilitychange', async () => {
            console.log('visibility state:', document.visibilityState)
            if (Sentry && typeof Sentry.configureScope === 'function') {
                Sentry.configureScope((scope) => {
                    scope.setTag('visibility_state', document.visibilityState)
                })
            }

            if (document.visibilityState !== 'visible') {
                // Don't show an error if the user hides the pages and then if fails to connect
                stopConnectionTimeout()

                return
            }

            pageLastBecameVisible = Date.now()

            if (pendingSaveMessage) {
                showSaveMessage(pendingSaveMessage)
                pendingSaveMessage = null
            }

            if (lastCallStartTime) {
                lastCallDuration = Date.now() - lastCallStartTime
                console.log(`last call duration was approximately ${lastCallDuration}ms`)
            }

            if (peerManager && !peerManager.isStopped()) {
                // Wait in case other event handlers will be fired after this one
                await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_PAGE_BECOMES_VISIBLE))

                // Make sure we're still connected
                await peerManager.reconnect(null, true)

                // Send call stats to extension
                if (lastCallStartTime) {
                    await peerManager.sendMessage({
                        type: 'callRecord',
                        timestamp: lastCallStartTime,
                        callNumber,
                        duration: lastCallDuration
                    })
                }
            }
            lastCallStartTime = null
        })
    }
}

function showVersionRelatedMessages() {
    if (/^(?:0\.[789])|(?:[1-9]\..*)\./.test(extensionVersion)) {
        document.getElementById('text-message-instructions-text-only').setAttribute('hidden', 'true')
        document.getElementById('text-message-instructions-with-link').removeAttribute('hidden')

        document.getElementById('open-options-page').addEventListener('click', async (e) => {
            e.preventDefault()

            if (peerManager) {
                await peerManager.sendMessage({
                    type: 'openOptions'
                })
            } else {
                console.error('cannot send open options message because peer manager is undefined')
            }
        })
    }
    // Show warning about version 0.9.5 being broken
    if (extensionVersion === '0.9.5') {
        const warning = document.getElementById('version-0-9-5-warning')
        if (warning) {
            warning.removeAttribute('hidden')
        }
    }
}

/**
 * Connection timeout functions
 */
function stopConnectionTimeout() {
    if (connectTimerIsRunning) {
        console.log('stopping connection timer')
    }
    clearTimeout(connectTimer)
    connectTimerIsRunning = false
}

// (Re)Start the connection timeout only if one isn't already running
function restartConnectionTimeout() {
    if (connectTimerIsRunning) {
        console.log('not restarting connection timer because it is still running')
        return
    }
    console.log('restarting connection timer')
    clearTimeout(connectTimer)
    connectTimerIsRunning = true
    connectTimer = setTimeout(async () => {
        console.error('connection timed out')
        connectTimerIsRunning = false

        if (peerManager && !peerManager.isWebSocketMode()) {
            console.log('trying websocket mode')
            try {
                restartConnectionTimeout()
                await peerManager.connect(true)
                return
            } catch (err) {
                console.error('error connecting in websocket mode', err)
            }
        }

        const err = new Error('Timed out trying to connect to the extension. Is the phone bank tab still open?')
        displayError(err)
        console.log('reporting timeout error to Sentry')
        Sentry.captureException(err)
        peerManager.stop()
    }, CONNECT_TIMEOUT)
}

function handleExtensionMessage(data) {
    // Automatically saving the call result only works for OpenVPB and EveryAction
    // phone banks that have the Texted result code enabled
    // (On BlueVote, it uses the Not Home code instead)
    // TODO in a future version, consider either falling back to other result codes like
    // Left Message or Not Home, or give the option to select the result code that will be sent
    if (Array.isArray(data.resultCodes) && domain && !/bluevote/.test(domain)) {
        if (!data.resultCodes.some((code) => code.toLowerCase() === 'texted')) {
            autoSaveTextedResultEnabled = false
            const warning = document.getElementById('texted-result-code-missing-warning')
            if (warning) {
                warning.removeAttribute('hidden')
            }
        }
    }

    if (data.yourName) {
        yourName = data.yourName
    }

    if (data.messageTemplates) {
        messageTemplates = data.messageTemplates

        // If we only received new message templates, recreate the links with the old contact details
        if (!data.contact) {
            createTextMessageLinks(firstName, phoneNumber, additionalFields)
        }
    }

    if (typeof data.callNumber === 'number') {
        callNumber = data.callNumber
    }

    // TODO handle call result from extension (and make sure it's saving the correct one)
    // if (data.lastCallResult) {
    //     if (!lastCallResult) {
    //         lastCallResult = data.lastCallResult
    //     } else if (lastCallResult && lastCallResult !== data.lastCallResult) {
    //         Sentry.captureMessage(`Last call result from extension (${data.lastCallResult}) does not match the one we sent (${lastCallResult})`)
    //     }
    // }

    if (data.contact) {
        if (!data.contact.phoneNumber || !data.contact.firstName) {
            return displayError(new Error(`Got invalid contact details from extension: ${JSON.stringify(data.contact)}`))
        }

        const matches = data.contact.phoneNumber.match(/\d+/g)
        if (!matches) {
            return displayError(new Error(`Got invalid phone number from extension: ${data.contact.phoneNumber}`))
        }
        let newPhoneNumber = matches.join('')
        if (newPhoneNumber.length === 10) {
            newPhoneNumber = '1' + newPhoneNumber
        }

        // New contact
        if (newPhoneNumber !== phoneNumber) {
            saveCallStats()

            if (loadContactSpan) {
                loadContactSpan.finish()
                loadContactSpan = null
            }
        }

        // Show the contact if it's a new one or we aren't waiting for a new one
        // (namely in the case where the page was hidden, the websocket errored)
        if (newPhoneNumber !== phoneNumber || !waitForNewContact) {
            waitForNewContact = false

            phoneNumber = newPhoneNumber
            firstName = data.contact.firstName

            if (data.contact.additionalFields && typeof data.contact.additionalFields === 'object') {
                const details = {}
                for (let key in data.contact.additionalFields) {
                    details[key.toLowerCase()] = data.contact.additionalFields[key]
                }
                additionalFields = details
            } else {
                additionalFields = null
            }

            // Update the relevant parts of the page with the new contact details
            setLoadingFinished()
            document.getElementById('contact-details').hidden = false
            document.getElementById('statistics').hidden = false

            document.getElementById('name').innerText = `${data.contact.firstName} ${data.contact.lastName}`

            document.getElementById('phone-number-link').href = "tel:" + phoneNumber
            document.getElementById('phone-number').innerText = data.contact.phoneNumber

            createTextMessageLinks(firstName, phoneNumber, additionalFields)

            // Scroll to contact card
            if (!isScrolledIntoView(document.getElementById('name'))) {
                document.getElementById('contact-details').scrollIntoView()
                window.scrollBy(0, 0 - document.querySelector('nav').scrollHeight)
            }
        }
    }

    if (data.stats) {
        if (data.stats.startTime) {
            startTime = data.stats.startTime
        }
        if (data.stats.calls && data.stats.calls > 0) {
            // TODO maybe update this as the duration is being updated (every second)
            document.getElementById('num-calls').innerText = `${data.stats.calls} Call${data.stats.calls > 1 ? 's' : ''}`
            document.getElementById('avg-call-time').innerText = msToTimeString((Date.now() - startTime) / data.stats.calls)

            if (data.stats.calls % 10 === 0 && typeof confetti === 'object') {
                const numConfettiPieces = Math.min(150, Math.max(30, data.stats.calls * 2))
                confetti.start(1500, numConfettiPieces)
            }
        }
        if (data.stats.successfulCalls) {
            document.getElementById('successful-calls').innerText = data.stats.successfulCalls
        }
    }

    const initialMessage = document.getElementById('initial-message')
    if (initialMessage) {
        if (data.callNumber === 0 || (data.stats && data.stats.calls === 0)) {
            initialMessage.removeAttribute('hidden')
        } else {
            initialMessage.setAttribute('hidden', 'true')
        }
    }

    if (data.type === 'disconnect') {
        console.log('got disconnect message from extension')
        markSessionComplete()
    }

    if (Array.isArray(data.resultCodes)) {
        createCallResultButtons(data.resultCodes)
    }
}

function createTextMessageLinks(firstName, phoneNumber, additionalFields) {
    const textMessageLinks = document.getElementById('text-message-links')
    while (textMessageLinks.firstChild) {
        textMessageLinks.removeChild(textMessageLinks.firstChild)
    }
    if (messageTemplates.length === 0) {
        document.getElementById('text-message-instructions')
            .removeAttribute('hidden')
    }
    else {
        document.getElementById('text-message-instructions')
            .setAttribute('hidden', 'true')
    }
    for (let { label, message, result } of messageTemplates) {
        const a = document.createElement('a')
        a.className = "btn btn-outline-secondary btn-block p-3 my-3"
        a.role = 'button'
        a.target = "_blank"
        let messageBody = message
            .replace(THEIR_NAME_REGEX, firstName)
            .replace(YOUR_NAME_REGEX, yourName)

        if (additionalFields) {
            let matches
            while ((matches = ADDITIONAL_FIELDS_REGEX.exec(messageBody))) {
                const keyWithBrackets = matches[0]
                const key = matches[1]
                if (typeof key === 'string') {
                    if (additionalFields[key.toLowerCase()]) {
                        messageBody = messageBody.replace(keyWithBrackets, additionalFields[key.toLowerCase()])
                    } else {
                        console.warn(`Could not replace [${key}] because that field was not sent by the extension in the contact's additional properites`)
                    }
                }
            }
        }

        a.href = `sms://${phoneNumber};?&body=${encodeURIComponent(messageBody)}`
        if (result) {
            a.innerHTML = TEXT_MESSAGE_MARK_TEXTED_ICON
        } else {
            a.innerHTML = TEXT_MESSAGE_ICON
        }
        a.querySelector('svg').classList.add('mr-2', 'mb-1')
        const span = document.createElement('span')
        span.innerText = label
        a.appendChild(span)

        let savedTextStats = false
        a.addEventListener('click', async (e) => {
            lastCallResult = result
            pendingSaveMessage = result

            if (storage.getItem('requireLongPressMode')) {
                console.log('long press mode enabled, ignoring click')
                e.preventDefault()
                // Copy the message body to the clipboard instead
                // TODO figure out if there's a better option than this
                if (navigator && navigator.clipboard) {
                    await navigator.clipboard.writeText(messageBody)
                    span.innerText = 'Message Copied to Clipboard'
                    a.classList.replace('btn-outline-secondary', 'btn-outline-success')
                    setTimeout(() => {
                        span.innerText = `Send ${label}`
                        a.classList.replace('btn-outline-success', 'btn-outline-secondary')
                    }, 800)
                } else {
                    console.warn('Clipboard is not available')
                    span.innerText = 'Cannot Copy to Clipboard :('
                    a.classList.replace('btn-outline-secondary', 'btn-outline-danger')
                    setTimeout(() => {
                        span.innerText = `Send ${label}`
                        a.classList.replace('btn-outline-danger', 'btn-outline-secondary')
                    }, 800)
                }
            } else if (result && autoSaveTextedResultEnabled) {
                console.log(`sending call result: ${result}`)
                if (Sentry && typeof Sentry.startTransaction === 'function') {
                    loadContactSpan = Sentry.startTransaction({
                        name: `${peerManager.mode}.loadNextContact`,
                        tags: {
                            connection_mode: peerManager.mode
                        }
                    })
                }

                // Return so we don't double-count the text stats
                return sendCallResult(result)
            }

            try {
                if (!savedTextStats) {
                    await fetchRetry(`https://stats.turbovpb.com/sessions/${sessionId}/texts`, {
                        method: 'POST'
                    }, 3)
                    savedTextStats = true
                }
            } catch (err) {
                console.error('error saving text stats', err)
            }
        })
        textMessageLinks.appendChild(a)
    }
}

function createCallResultButtons(resultCodes) {
    const callResultLinks = document.getElementById('call-result-links')
    while (callResultLinks.firstChild) {
        callResultLinks.removeChild(callResultLinks.firstChild)
    }
    // Sort result codes by frequency of use
    const orderedResultCodes = resultCodes.sort((a, b) => (resultCodesTimesUsed[b] || 0) - (resultCodesTimesUsed[a] || 0))
    for (let result of orderedResultCodes) {
        // Don't display the Texted result code if there are message templates configured
        if (result && result.toLowerCase() === 'texted' && messageTemplates.length > 0) {
            return
        }

        if (!resultCodesTimesUsed[result]) {
            resultCodesTimesUsed[result] = 0
        }

        const button = document.createElement('button')
        button.className = "btn btn-outline-danger btn-block p-3 my-3"
        button.role = 'button'

        if (result.startsWith('Do Not')) {
            button.innerHTML = CALL_RESULT_ICONS['Do Not']
        } else if (CALL_RESULT_ICONS[result]) {
            button.innerHTML = CALL_RESULT_ICONS[result]
        } else {
            button.innerHTML = CALL_RESULT_ICONS.Other
        }
        const svg = button.querySelector('svg')
        if (svg) {
            svg.classList.add('mr-2', 'mb-1')
        }


        const span = document.createElement('span')
        span.innerText = result
        button.appendChild(span)

        button.addEventListener('click', async () => {
            console.log(`Sending call result: ${result}`)
            resultCodesTimesUsed[result] += 1
            storage.setItem('resultCodes', JSON.stringify(resultCodesTimesUsed))
            lastCallResult = result

            if (Sentry && typeof Sentry.startTransaction === 'function') {
                loadContactSpan = Sentry.startTransaction({
                    name: `${peerManager.mode}.loadNextContact`,
                    tags: {
                        connection_mode: peerManager.mode
                    }
                })
            }

            await sendCallResult(result, true)
        })

        callResultLinks.appendChild(button)
    }
}

// Send the call result to the extension
async function sendCallResult(result, showSaveMessageNow) {
    await peerManager.sendMessage({
        type: 'callResult',
        result,
        callNumber,
        timestamp: (new Date()).toISOString()
    })

    // Only show the next contact when a new contact
    // is loaded (ignore if the same contact is resent)
    waitForNewContact = true
    setLoading()

    if (showSaveMessageNow) {
        showSaveMessage(result)
    }

    await saveCallStats()
}

// Save anonymous call stats to the centralized statistics service
// This is called either when:
// 1. A text message button is clicked
// 2. A result code button is clicked
// 3. A new contact is loaded
async function saveCallStats() {
    if (!lastCallDuration) {
        if (!lastCallResult || lastCallResult.toLowerCase() !== 'texted') {
            // This means the last call was already saved
            return
        }
    }

    console.log(`Saving call result. Duration: ${lastCallDuration}ms, result: ${lastCallResult}`)

    try {
        // TODO we might miss the last call if they never return to the page

        const requests = []

        if (lastCallDuration) {
            const body = {
                duration: lastCallDuration,
            }
            if (lastCallResult) {
                body.lastCallResult = lastCallResult
            }
            fetchRetry(`https://stats.turbovpb.com/sessions/${sessionId}/calls`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify(body)
            }, 3)
        }

        if (lastCallResult && lastCallResult.toLowerCase() === 'texted') {
            requests.push(fetchRetry(`https://stats.turbovpb.com/sessions/${sessionId}/texts`, {
                method: 'POST'
            }, 3))
        }

        await Promise.all(requests)

    } catch (err) {
        console.error('Error saving call stats', err)
    }

    lastCallDuration = 0
    lastCallResult = null
    lastCallStartTime = null
}


/**
 * Functions to show session status in the DOM
 */

function setStatus(status, alertType) {
    if (document.readyState === 'complete') {
        const statusElement = document.getElementById('status')
        statusElement.innerText = status
        statusElement.className = statusElement.className.replace(/badge-\w+/, `badge-${alertType}`)
    } else {
        function listener() {
            if (document.readyState === 'complete') {
                document.removeEventListener('readystatechange', listener)
                setStatus(status, alertType)
            }
        }
        document.addEventListener('readystatechange', listener)
    }
}

function displayError(err) {
    setStatus('Error. Reload Tab.', 'danger')
    setLoadingFinished()

    // Display full error message
    document.getElementById('warning-heading').innerText = 'Error Connecting to Extension'
    document.getElementById('warning-text1').innerText = `Error ${(err.type && err.type.replace('-', ' ')) || 'details'}: ${err.message}`

    if (err.type !== 'browser-incompatible') {
        const warningText2 = document.getElementById('warning-text2')
        warningText2.innerHTML = ''
        warningText2.innerText =
            `Try closing the OpenVPB tab in your browser, opening a new one, and re-scanning the QR code. If that doesn't work, please send this pre-filled email to: `
        const a = document.createElement('a')
        a.innerText = 'evan@turbovpb.com'
        const emailBody = encodeURIComponent(`Hi Evan,

        I like the idea for TurboVPB but I ran into a problem trying to use it.

        (Please describe what happened in as much detail as possible. Did the problem persist after closing the phone bank tab and rescanning the QR code? Which phone bank site are you using TurboVPB on?)

        Please fix this issue.
        Thank you!


        Error: ${err.type} ${err.message}
        Session: ${sessionId}
        Release: ${release}
        Connection Mode: ${peerManager && peerManager.mode}
        Extension Version: ${extensionVersion}
        Desktop Browser: ${extensionUserAgent}
        Domain: ${domain}
        Mobile Browser: ${navigator.userAgent}`)
        a.href = `mailto:evan@turbovpb.com?subject=${encodeURIComponent('Problem with TurboVPB')}&body=${emailBody}`
        warningText2.appendChild(a)
        warningText2.appendChild(document.createTextNode('.'))
    } else {
        document.getElementById('warning-text2').innerText =
            'Unfortunately, this means that TurboVPB will not work on your phone. Sorry :('
    }
    document.getElementById('warning-text2').hidden = false
    document.getElementById('warning-container').hidden = false

    // Clear the contact details
    document.getElementById('contact-details').hidden = true
    document.getElementById('statistics').hidden = true
    if (document.getElementById('name')) {
        document.getElementById('name').innerText = ''
    }
    if (document.getElementById('phone-number-link')) {
        document.getElementById('phone-number-link').href = ''
    }
    if (document.getElementById('phone-number')) {
        document.getElementById('phone-number').innerText = ''
    }
}

function markSessionComplete() {
    console.log('Session complete')
    sessionComplete = true
    window.sessionStorage.setItem('sessionComplete', 'true')
    document.getElementById('contact-details').remove()
    document.getElementById('session-ended').removeAttribute('hidden')

    stopConnectionTimeout()

    if (sessionTimeInterval) {
        clearInterval(sessionTimeInterval)
    }

    if (peerManager) {
        peerManager.stop()
    }

    setStatus('Session Complete', 'primary')
    document.getElementById('loading').setAttribute('hidden', 'true')
}

function sessionIsComplete() {
    if (sessionComplete) {
        return true
    }
    try {
        // This may result in "SecurityError: The operation is insecure."
        if (window.sessionStorage.getItem('sessionComplete') === 'true') {
            return true
        }
    } catch (err) { }
    return false
}

function setLoading() {
    document.getElementById('loading').removeAttribute('hidden')
    document.getElementById('contact-details').setAttribute('hidden', 'true')
}

function setLoadingFinished() {
    if (document.getElementById('loading')) {
        document.getElementById('loading').setAttribute('hidden', 'true')
    }
    if (document.getElementById('contact-details')) {
        document.getElementById('contact-details').removeAttribute('hidden')
    }
}

function showSaveMessage(result) {
    document.getElementById('snackbar').classList.add('show')
    document.getElementById('snackbar-message').innerText = `Saved Call Result: ${result}`
    setTimeout(() => {
        document.getElementById('snackbar').classList.remove('show')
    }, 2500)
}


/**
 * Utilities
 */

async function fetchRetry(url, params, times) {
    if (!times) {
        times = 3
    }
    let backoff = 50
    let error
    while (times > 0) {
        try {
            const response = await fetch(url, params)
            if (response.ok) {
                return response
            } else {
                console.error('fetch response was not ok')
            }
        } catch (err) {
            error = err
        }

        // TODO don't retry fatal errors
        times -= 1
        if (times === 0) {
            throw error
        } else {
            console.error('fetch error, retrying', error)
            await new Promise((resolve) => setTimeout(resolve, backoff))
            backoff = backoff * 2
        }
    }
}

function msToTimeString(ms) {
    let time = ''
    const hours = Math.floor(ms / 3600000)
    const min = Math.floor((ms % 3600000) / 60000)
    const sec = Math.floor((ms % 60000) / 1000)
    if (hours > 0) {
        time += hours + ':'
    }
    if (min < 10) {
        time += '0' + min
    } else {
        time += min
    }
    time += ':'
    if (sec < 10) {
        time += '0' + sec
    } else {
        time += sec
    }
    return time
}

function isScrolledIntoView(el) {
    const rect = el.getBoundingClientRect()
    const elemTop = rect.top
    const elemBottom = rect.bottom

    // Only completely visible elements return true:
    // const isVisible = (elemTop >= 0) && (elemBottom <= window.innerHeight);

    // Partially visible elements return true:
    const isVisible = elemTop < window.innerHeight && elemBottom >= 0
    return isVisible
}
