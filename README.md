# ![TurboVPB Logo](./extension/icons/phone-outgoing-blue.svg) TurboVPB
[TurboVPB](https://turbovpb.com) is a free browser extension that speeds up phone banking with EveryAction's Open Virtual Phone Bank (OpenVPB), VAN, VoteBuilder, and BlueVote.

Get the extension at [turbovpb.com](https://turbovpb.com).

## Code Overview
- [`docs`](./docs/README.md) - the TurboVPB website
- [`extension`](./extension/README.md) - source code of the extension

## Technical Details

The TurboVPB extension parses contact details from the virtual phone bank page and sends them via [WebRTC](https://webrtc.org/) to a static site loaded on the caller's phone.

**TurboVPB never collects or stores the names, phone numbers, or any personal details of people contacted.**

### WebRTC / PeerJS

TurboVPB uses a self-hosted [PeerJS](https://peerjs.com/) server to exchange WebRTC connection information between the browser extension and the mobile website. Contact details are never sent through this server.

TurboVPB uses [Twilio's Network Traversal service](https://www.twilio.com/docs/stun-turn) to help the WebRTC peers discover and connect to one another.

### Privacy-Preserving Analytics

TurboVPB tracks page views using a self-hosted instance of [Ackee](https://ackee.electerious.com/), an open source "analytics tool for those who care about privacy". See their page on data [Anonymization](https://docs.ackee.electerious.com/#/docs/Anonymization) for more about how Ackee collects anonymized analytics.

Because Ackee does not yet support tracking events ([electerious/Ackee#40](https://github.com/electerious/Ackee/issues/40)), I set up a simple statistics server to track the number of calls and texts sent with TurboVPB. This collects the timestamp, duration, and an ID that is randomly generated for each calling session.

The mobile ([connect](./docs/connect.html)) page uses [Sentry](https://sentry.io) to collect errors if they occur while TurboVPB is being used. No contacts' details are sent to Sentry.

### Hosting

- TurboVPB.com is hosted on Github Pages
- The PeerJS server and Ackee analytics servers are hosted on Heroku
- All of the above are behind Cloudflare

## Questions or Feedback?

Open an issue or email me at evan [at] turbovpb [dot] com.