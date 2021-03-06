# ![TurboVPB Logo](./extension/icons/phone-outgoing-blue.svg) TurboVPB
[TurboVPB](https://turbovpb.com) is a free browser extension that speeds up phone banking with EveryAction's Open Virtual Phone Bank (OpenVPB), VAN, VoteBuilder, and BlueVote.

Get the extension at [turbovpb.com](https://turbovpb.com).

:star: _If you find TurboVPB helpful, please leave a review in the [Chrome Web Store](https://chrome.google.com/webstore/detail/turbovpb/deekoplmjnhcnbkpojidakdbllmdhekh) or [Mozilla Add-Ons](https://addons.mozilla.org/en-US/firefox/addon/turbovpb/) to help others find it too!_ :star:

## Code Overview
- [`docs`](./docs#turbovpb-website) - the TurboVPB website
- [`extension`](./extension#turbovpb-extension) - source code of the extension

## Technical Details

The TurboVPB extension parses contact details from the virtual phone bank page and sends them to a static site loaded on the caller's phone.
It uses one of two private communication channels to send the details between the extension and the mobile page.

To connect the extension and mobile page, the user scans a QR code generated by the extension with their phone.
The link encoded in the QR code points to https://turbovpb.com/connect and includes connection details in the query parameters and hash/fragment.

**TurboVPB never collects or stores the names, phone numbers, or any personal details of people contacted.**

### Encrypted WebSocket PubSub

The first communication method TurboVPB uses is a publish-subscribe pattern where the messages are end-to-end encrypted using symmetric encryption.

For each phone bank session, the extension uses the browser's [`SubtleCrypto.generateKey()`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey) method to create an AES-GCM encryption key with a 256-bit key.
The encryption key is passed to the static mobile site in the URL fragment/hash at the end of the URL encoded in the QR code.
In addition, the extension generates a random PubSub channel ID, which is also communicated to the mobile page in the connection URL.

TurboVPB uses the [Nchan](https://nchan.io) PubSub server implementation.

### WebRTC / PeerJS

The second communication method is [WebRTC](https://webrtc.io), using the [PeerJS](https://peerjs.com) library and server to broker the connection.

> **Why use WebRTC too?**
>
> TurboVPB was originally developed using only WebRTC, because of its speed and privacy.
> However, the TurboVPB use case involves the user constantly switching between their mobile browser and their phone or messaging apps.
> Mobile browsers disconnect WebRTC and WebSocket connections when a page is hidden for more than a few seconds, so as a result, the connection needs to be constantly re-established (potentially as often as between every call).
> What is worse is that the extension and browser also need to maintain their WebSocket connection to the broker server in order to re-establish the WebRTC connection when it is severed.
>
> The PubSub communication method was added because if the extension and mobile page need to communicate some details (the WebRTC connection information) via a WebSocket-based PubSub server anyway and they need to constantly re-establish the connection, they might as well send the contact details (encrypted) via WebSocket-based PubSub.
> In practice, the WebSocket PubSub reconnection is considerably faster and thus lowers the average latency for sending contact details versus WebRTC.
>
> WebRTC was kept as a fallback option (for now), because some browsers supprot WebRTC but do not support the SubtleCrypto API used to encrypt the contact details.

TurboVPB uses a self-hosted [PeerJS](https://peerjs.com/) server to exchange WebRTC connection information between the browser extension and the mobile website. Contact details are never sent through this server.

TurboVPB uses [Twilio's Network Traversal service](https://www.twilio.com/docs/stun-turn) to help the WebRTC peers discover and connect to one another.

### Privacy-Preserving Analytics

TurboVPB tracks page views using a self-hosted instance of [Ackee](https://ackee.electerious.com/), an open source "analytics tool for those who care about privacy". See their page on data [Anonymization](https://docs.ackee.electerious.com/#/docs/Anonymization) for more about how Ackee collects anonymized analytics.

TurboVPB also tracks the total number of calls placed and texts sent using [Google's BigQuery](https://cloud.google.com/bigquery/).
Calls and texts are associated with a randomly generated session ID but no identifying information about the contact or user is sent to this service.

The mobile ([connect](./docs/connect.html)) page uses [Sentry](https://sentry.io) to collect errors if they occur while TurboVPB is being used. No contacts' details are sent to Sentry.

### Hosting

- TurboVPB.com is hosted on Github Pages
- The PeerJS server and Ackee analytics servers are hosted on Heroku
- All of the above are behind Cloudflare

## Thanks

### Open Source

Major thanks to the following open source projects that made this possible:

- [Nchan](https://nchan.io)'s brilliant, high-performance PubSub server
- [Ackee](https://ackee.electerious.com/)'s privacy-preserving analytics
- [PeerJS](https://peerjs.com)'s easy-to-use WebRTC implementation
- [Bootstrap](https://getbootstrap.com)'s straightforward theme
- [Tingle](https://tingle.robinparisi.com/)'s plain vanilla modal plugin
- [kjua](https://larsjung.de/kjua/)'s QR code generator
- Mozilla's [Web Extension polyfill](https://github.com/mozilla/webextension-polyfill)

And thanks to all of the people who work on Web standards like WebSockets, WebRTC, and Web Crypto.

### Sponsored Services

TurboVPB would have been much more difficult (and expensive) to build and run without the sponsored open source plans from:

- [Sentry](https://sentry.io)
- [BrowserStack](https://browserstack.com)

And the generous free tiers of:

- [Github Pages](https://pages.github.com)
- [Heroku](https://heroku.com)
- [Cloudflare](https://cloudflare.com)
- [Google Cloud](https://cloud.google.com)
- [ImprovMX](https://improvmx.com)

## Questions or Feedback?

Open an issue or email me at evan [at] turbovpb [dot] com.