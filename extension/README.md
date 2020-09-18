# TurboVPB Extension

## Source Code

- [background.js](./background.js) - the [background script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Anatomy_of_a_WebExtension#Background_scripts) that manages the PeerJS connections
- [popup.html](./popup.html) and [options.html](./options.html) are the toolbar popup and extension options pages
- [content.js](./content.js) is the [Content Script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Anatomy_of_a_WebExtension#Content_scripts) that is injected into virtual phone bank pages that the user has enabled TurboVPB on
- [openvpb.js](./openvpb.js), [everyaction.js](./everyaction.js), and [bluevote.js](./bluevote.js) contain platform-specific code for interacting with the phone bank pages

## Dependencies

- [PeerJS](https://peerjs.com) - the client code for managing WebRTC connections
- [WebExtension Polyfill](https://github.com/mozilla/webextension-polyfill) - wraps Chrome-specific browser APIs with the WebExtension standard interfaces
- [Content Scripts Register Polyfill](https://github.com/fregante/webext-dynamic-content-scripts) - adds support for dynamically loading Content Scripts in Chrome
- [kjua](https://larsjung.de/kjua/) - a QR code generator
- [Tingle.js] - a minimalist modal plugin (used for the QR code popup)
