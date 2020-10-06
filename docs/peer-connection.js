const PUBSUB_URL_BASE = 'wss://pubsub.turbovpb.com/c/'
const ENCRYPTION_KEY_LENGTH = 256
const ENCRYPTION_IV_BYTE_LENGTH = 12
const ENCRYPTION_ALGORITHM = 'AES-GCM'
const BASE64_URL_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const BASE64_URL_LOOKUP = new Uint8Array(256);
for (let i = 0; i < BASE64_URL_CHARACTERS.length; i++) {
    BASE64_URL_LOOKUP[BASE64_URL_CHARACTERS.charCodeAt(i)] = i;
}

class PeerConnection {
    constructor(wsOpts = {}) {
        this.ws = null
        this.wsOpts = wsOpts
        this.sessionId = null
        this.encryptionKey = null
        this.connecting = false
        this.identity = null

        this.onconnect = () => { }
        this.onconnecting = () => { }
        this.onerror = () => { }
        this.onmessage = () => { }
    }

    async connect(sessionId, encryptionKey) {
        if (sessionId && encryptionKey) {
            this.identity = 'browser'
            this.sessionId = sessionId
            this.encryptionKey = await importKey(encryptionKey)
        } else {
            this.identity = 'extension'
            this.sessionId = encodeBase64Url(crypto.getRandomValues(new Uint8Array(16)))
            this.encryptionKey = await generateKey()
        }
        this.reconnect()
    }

    reconnect() {
        if (this.connecting || this.isConnected()) {
            return
        }
        this.connecting = true
        if (this.ws) {
            this.ws.close()
        }

        this.onconnecting()

        const pubsubUrl = `${PUBSUB_URL_BASE}${this.sessionId}/${this.identity}`
        console.log(`Connecting to ${pubsubUrl}`)
        this.ws = new ReconnectingWebSocket(pubsubUrl, [], {
            ...this.wsOpts,
            binaryType: 'arraybuffer'
        })
        this.connecting = false

        this.ws.onopen = async () => {
            console.log('websocket open')
            this.connecting = false
            await this.sendMessage({
                type: 'connect'
            })
        }
        this.ws.onclose = () => {
            console.log('websocket closed')
            // ReconnectingWebSocket will automatically reconnect
            this.onconnecting()
        }
        this.ws.onmessage = async ({ data }) => {
            let message
            try {
                message = await decrypt(this.encryptionKey, data)
            } catch (err) {
                console.error(`Error decrypting message from peer ${this.sessionId}`, err.message || err)
                return
            }
            this.onconnect()
            this.onmessage(message)
        }
        this.ws.onerror = ({ error }) => {
            console.log('websocket error', error)
            this.connecting = false
            this.onerror(error)
        }
    }

    async getConnectionSecret() {
        return exportKey(this.encryptionKey)
    }

    getSessionId() {
        return this.sessionId
    }

    destroy() {
        this.ws.close()
    }

    async sendMessage(message) {
        const ciphertext = await encrypt(this.encryptionKey, message)
        this.ws.send(ciphertext)
    }

    isConnected() {
        return this.ws && this.ws.readyState === ReconnectingWebSocket.OPEN
    }
}

async function generateKey() {
    if (!crypto || !crypto.subtle) {
        throw new Error(`SubtleCrypto API is required to generate key`)
    }

    return crypto.subtle.generateKey({
        name: ENCRYPTION_ALGORITHM,
        length: ENCRYPTION_KEY_LENGTH
    }, true, ['encrypt', 'decrypt'])
}

async function exportKey(key) {
    const buffer = await crypto.subtle.exportKey('raw', key)
    return encodeBase64Url(buffer)
}

async function importKey(base64) {
    const buffer = decodeBase64Url(base64)
    return crypto.subtle.importKey('raw', buffer, {
        name: ENCRYPTION_ALGORITHM
    }, true, ['encrypt', 'decrypt'])
}

async function encrypt(encryptionKey, message) {
    if (typeof message === 'object') {
        message = JSON.stringify(message)
    }
    const buffer = (new TextEncoder()).encode(message)
    const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTE_LENGTH))
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
        name: 'AES-GCM',
        iv
    }, encryptionKey, buffer))
    const payload = new Uint8Array(ciphertext.byteLength + ENCRYPTION_IV_BYTE_LENGTH)
    payload.set(ciphertext, 0)
    payload.set(iv, ciphertext.byteLength)
    return payload
}

async function decrypt(encryptionKey, arrayBuffer) {
    const payload = new Uint8Array(arrayBuffer)
    const ciphertext = payload.slice(0, 0 - ENCRYPTION_IV_BYTE_LENGTH)
    const iv = payload.slice(0 - ENCRYPTION_IV_BYTE_LENGTH)
    const plaintext = await crypto.subtle.decrypt({
        name: 'AES-GCM',
        iv
    }, encryptionKey, ciphertext)
    const string = (new TextDecoder()).decode(plaintext)
    return JSON.parse(string)
}

// Based on https://github.com/herrjemand/Base64URL-ArrayBuffer/blob/master/lib/base64url-arraybuffer.js
function encodeBase64Url(arraybuffer) {
    const bytes = new Uint8Array(arraybuffer)
    let base64 = ''

    for (let i = 0; i < bytes.length; i += 3) {
        base64 += BASE64_URL_CHARACTERS[bytes[i] >> 2]
        base64 += BASE64_URL_CHARACTERS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)]
        base64 += BASE64_URL_CHARACTERS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)]
        base64 += BASE64_URL_CHARACTERS[bytes[i + 2] & 63]
    }

    if ((bytes.length % 3) === 2) {
        base64 = base64.substring(0, base64.length - 1)
    } else if (bytes.length % 3 === 1) {
        base64 = base64.substring(0, base64.length - 2)
    }

    return base64
}

function decodeBase64Url(base64) {
    base64 = base64.replace(/[=]+$/, '')

    let bufferLength = base64.length * 0.75
    const arraybuffer = new ArrayBuffer(bufferLength)
    const bytes = new Uint8Array(arraybuffer)

    let p = 0
    let encoded1, encoded2, encoded3, encoded4
    for (let i = 0; i < base64.length; i += 4) {
        encoded1 = BASE64_URL_LOOKUP[base64.charCodeAt(i)]
        encoded2 = BASE64_URL_LOOKUP[base64.charCodeAt(i + 1)]
        encoded3 = BASE64_URL_LOOKUP[base64.charCodeAt(i + 2)]
        encoded4 = BASE64_URL_LOOKUP[base64.charCodeAt(i + 3)]

        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63)
    }

    return arraybuffer
}

// MIT License:
//
// Copyright (c) 2010-2012, Joe Walnes
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/**
 * This behaves like a WebSocket in every way, except if it fails to connect,
 * or it gets disconnected, it will repeatedly poll until it successfully connects
 * again.
 *
 * It is API compatible, so when you have:
 *   ws = new WebSocket('ws://....');
 * you can replace with:
 *   ws = new ReconnectingWebSocket('ws://....');
 *
 * The event stream will typically look like:
 *  onconnecting
 *  onopen
 *  onmessage
 *  onmessage
 *  onclose // lost connection
 *  onconnecting
 *  onopen  // sometime later...
 *  onmessage
 *  onmessage
 *  etc...
 *
 * It is API compatible with the standard WebSocket API, apart from the following members:
 *
 * - `bufferedAmount`
 * - `extensions`
 * - `binaryType`
 *
 * Latest version: https://github.com/joewalnes/reconnecting-websocket/
 * - Joe Walnes
 *
 * Syntax
 * ======
 * var socket = new ReconnectingWebSocket(url, protocols, options);
 *
 * Parameters
 * ==========
 * url - The url you are connecting to.
 * protocols - Optional string or array of protocols.
 * options - See below
 *
 * Options
 * =======
 * Options can either be passed upon instantiation or set after instantiation:
 *
 * var socket = new ReconnectingWebSocket(url, null, { debug: true, reconnectInterval: 4000 });
 *
 * or
 *
 * var socket = new ReconnectingWebSocket(url);
 * socket.debug = true;
 * socket.reconnectInterval = 4000;
 *
 * debug
 * - Whether this instance should log debug messages. Accepts true or false. Default: false.
 *
 * automaticOpen
 * - Whether or not the websocket should attempt to connect immediately upon instantiation. The socket can be manually opened or closed at any time using ws.open() and ws.close().
 *
 * reconnectInterval
 * - The number of milliseconds to delay before attempting to reconnect. Accepts integer. Default: 1000.
 *
 * maxReconnectInterval
 * - The maximum number of milliseconds to delay a reconnection attempt. Accepts integer. Default: 30000.
 *
 * reconnectDecay
 * - The rate of increase of the reconnect delay. Allows reconnect attempts to back off when problems persist. Accepts integer or float. Default: 1.5.
 *
 * timeoutInterval
 * - The maximum time in milliseconds to wait for a connection to succeed before closing and retrying. Accepts integer. Default: 2000.
 *
 */
(function (global, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.ReconnectingWebSocket = factory();
    }
})(this, function () {

    if (!('WebSocket' in window)) {
        return;
    }

    function ReconnectingWebSocket(url, protocols, options) {

        // Default settings
        var settings = {

            /** Whether this instance should log debug messages. */
            debug: false,

            /** Whether or not the websocket should attempt to connect immediately upon instantiation. */
            automaticOpen: true,

            /** The number of milliseconds to delay before attempting to reconnect. */
            reconnectInterval: 1000,
            /** The maximum number of milliseconds to delay a reconnection attempt. */
            maxReconnectInterval: 30000,
            /** The rate of increase of the reconnect delay. Allows reconnect attempts to back off when problems persist. */
            reconnectDecay: 1.5,

            /** The maximum time in milliseconds to wait for a connection to succeed before closing and retrying. */
            timeoutInterval: 2000,

            /** The maximum number of reconnection attempts to make. Unlimited if null. */
            maxReconnectAttempts: null,

            /** The binary type, possible values 'blob' or 'arraybuffer', default 'blob'. */
            binaryType: 'blob'
        }
        if (!options) { options = {}; }

        // Overwrite and define settings with options if they exist.
        for (var key in settings) {
            if (typeof options[key] !== 'undefined') {
                this[key] = options[key];
            } else {
                this[key] = settings[key];
            }
        }

        // These should be treated as read-only properties

        /** The URL as resolved by the constructor. This is always an absolute URL. Read only. */
        this.url = url;

        /** The number of attempted reconnects since starting, or the last successful connection. Read only. */
        this.reconnectAttempts = 0;

        /**
         * The current state of the connection.
         * Can be one of: WebSocket.CONNECTING, WebSocket.OPEN, WebSocket.CLOSING, WebSocket.CLOSED
         * Read only.
         */
        this.readyState = WebSocket.CONNECTING;

        /**
         * A string indicating the name of the sub-protocol the server selected; this will be one of
         * the strings specified in the protocols parameter when creating the WebSocket object.
         * Read only.
         */
        this.protocol = null;

        // Private state variables

        var self = this;
        var ws;
        var forcedClose = false;
        var timedOut = false;
        var eventTarget = document.createElement('div');

        // Wire up "on*" properties as event handlers

        eventTarget.addEventListener('open', function (event) { self.onopen(event); });
        eventTarget.addEventListener('close', function (event) { self.onclose(event); });
        eventTarget.addEventListener('connecting', function (event) { self.onconnecting(event); });
        eventTarget.addEventListener('message', function (event) { self.onmessage(event); });
        eventTarget.addEventListener('error', function (event) { self.onerror(event); });

        // Expose the API required by EventTarget

        this.addEventListener = eventTarget.addEventListener.bind(eventTarget);
        this.removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
        this.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);

        /**
         * This function generates an event that is compatible with standard
         * compliant browsers and IE9 - IE11
         *
         * This will prevent the error:
         * Object doesn't support this action
         *
         * http://stackoverflow.com/questions/19345392/why-arent-my-parameters-getting-passed-through-to-a-dispatched-event/19345563#19345563
         * @param s String The name that the event should use
         * @param args Object an optional object that the event will use
         */
        function generateEvent(s, args) {
            var evt = document.createEvent("CustomEvent");
            evt.initCustomEvent(s, false, false, args);
            return evt;
        };

        this.open = function (reconnectAttempt) {
            ws = new WebSocket(self.url, protocols || []);
            ws.binaryType = this.binaryType;

            if (reconnectAttempt) {
                if (this.maxReconnectAttempts && this.reconnectAttempts > this.maxReconnectAttempts) {
                    return;
                }
            } else {
                eventTarget.dispatchEvent(generateEvent('connecting'));
                this.reconnectAttempts = 0;
            }

            if (self.debug || ReconnectingWebSocket.debugAll) {
                console.debug('ReconnectingWebSocket', 'attempt-connect', self.url);
            }

            var localWs = ws;
            var timeout = setTimeout(function () {
                if (self.debug || ReconnectingWebSocket.debugAll) {
                    console.debug('ReconnectingWebSocket', 'connection-timeout', self.url);
                }
                timedOut = true;
                localWs.close();
                timedOut = false;
            }, self.timeoutInterval);

            ws.onopen = function (event) {
                clearTimeout(timeout);
                if (self.debug || ReconnectingWebSocket.debugAll) {
                    console.debug('ReconnectingWebSocket', 'onopen', self.url);
                }
                self.protocol = ws.protocol;
                self.readyState = WebSocket.OPEN;
                self.reconnectAttempts = 0;
                var e = generateEvent('open');
                e.isReconnect = reconnectAttempt;
                reconnectAttempt = false;
                eventTarget.dispatchEvent(e);
            };

            ws.onclose = function (event) {
                clearTimeout(timeout);
                ws = null;
                if (forcedClose) {
                    self.readyState = WebSocket.CLOSED;
                    eventTarget.dispatchEvent(generateEvent('close'));
                } else {
                    self.readyState = WebSocket.CONNECTING;
                    var e = generateEvent('connecting');
                    e.code = event.code;
                    e.reason = event.reason;
                    e.wasClean = event.wasClean;
                    eventTarget.dispatchEvent(e);
                    if (!reconnectAttempt && !timedOut) {
                        if (self.debug || ReconnectingWebSocket.debugAll) {
                            console.debug('ReconnectingWebSocket', 'onclose', self.url);
                        }
                        eventTarget.dispatchEvent(generateEvent('close'));
                    }

                    var timeout = self.reconnectInterval * Math.pow(self.reconnectDecay, self.reconnectAttempts);
                    setTimeout(function () {
                        self.reconnectAttempts++;
                        self.open(true);
                    }, timeout > self.maxReconnectInterval ? self.maxReconnectInterval : timeout);
                }
            };
            ws.onmessage = function (event) {
                if (self.debug || ReconnectingWebSocket.debugAll) {
                    console.debug('ReconnectingWebSocket', 'onmessage', self.url, event.data);
                }
                var e = generateEvent('message');
                e.data = event.data;
                eventTarget.dispatchEvent(e);
            };
            ws.onerror = function (event) {
                if (self.debug || ReconnectingWebSocket.debugAll) {
                    console.debug('ReconnectingWebSocket', 'onerror', self.url, event);
                }
                eventTarget.dispatchEvent(generateEvent('error'));
            };
        }

        // Whether or not to create a websocket upon instantiation
        if (this.automaticOpen == true) {
            this.open(false);
        }

        /**
         * Transmits data to the server over the WebSocket connection.
         *
         * @param data a text string, ArrayBuffer or Blob to send to the server.
         */
        this.send = function (data) {
            if (ws) {
                if (self.debug || ReconnectingWebSocket.debugAll) {
                    console.debug('ReconnectingWebSocket', 'send', self.url, data);
                }
                return ws.send(data);
            } else {
                throw 'INVALID_STATE_ERR : Pausing to reconnect websocket';
            }
        };

        /**
         * Closes the WebSocket connection or connection attempt, if any.
         * If the connection is already CLOSED, this method does nothing.
         */
        this.close = function (code, reason) {
            // Default CLOSE_NORMAL code
            if (typeof code == 'undefined') {
                code = 1000;
            }
            forcedClose = true;
            if (ws) {
                ws.close(code, reason);
            }
        };

        /**
         * Additional public API method to refresh the connection if still open (close, re-open).
         * For example, if the app suspects bad data / missed heart beats, it can try to refresh.
         */
        this.refresh = function () {
            if (ws) {
                ws.close();
            }
        };
    }

    /**
     * An event listener to be called when the WebSocket connection's readyState changes to OPEN;
     * this indicates that the connection is ready to send and receive data.
     */
    ReconnectingWebSocket.prototype.onopen = function (event) { };
    /** An event listener to be called when the WebSocket connection's readyState changes to CLOSED. */
    ReconnectingWebSocket.prototype.onclose = function (event) { };
    /** An event listener to be called when a connection begins being attempted. */
    ReconnectingWebSocket.prototype.onconnecting = function (event) { };
    /** An event listener to be called when a message is received from the server. */
    ReconnectingWebSocket.prototype.onmessage = function (event) { };
    /** An event listener to be called when an error occurs. */
    ReconnectingWebSocket.prototype.onerror = function (event) { };

    /**
     * Whether all instances of ReconnectingWebSocket should log debug messages.
     * Setting this to true is the equivalent of setting all instances of ReconnectingWebSocket.debug to true.
     */
    ReconnectingWebSocket.debugAll = false;

    ReconnectingWebSocket.CONNECTING = WebSocket.CONNECTING;
    ReconnectingWebSocket.OPEN = WebSocket.OPEN;
    ReconnectingWebSocket.CLOSING = WebSocket.CLOSING;
    ReconnectingWebSocket.CLOSED = WebSocket.CLOSED;

    return ReconnectingWebSocket;
});
