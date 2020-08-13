// modules are defined as an array
// [ module function, map of requires ]
//
// map of requires is short require name -> numeric require
//
// anything defined in a previous bundle is accessed via the
// orig method which is the require for previous bundles
parcelRequire = (function (modules, cache, entry, globalName) {
  // Save the require from previous bundle to this closure if any
  var previousRequire = typeof parcelRequire === 'function' && parcelRequire;
  var nodeRequire = typeof require === 'function' && require;

  function newRequire(name, jumped) {
    if (!cache[name]) {
      if (!modules[name]) {
        // if we cannot find the module within our internal map or
        // cache jump to the current global require ie. the last bundle
        // that was added to the page.
        var currentRequire = typeof parcelRequire === 'function' && parcelRequire;
        if (!jumped && currentRequire) {
          return currentRequire(name, true);
        }

        // If there are other bundles on this page the require from the
        // previous one is saved to 'previousRequire'. Repeat this as
        // many times as there are bundles until the module is found or
        // we exhaust the require chain.
        if (previousRequire) {
          return previousRequire(name, true);
        }

        // Try the node require function if it exists.
        if (nodeRequire && typeof name === 'string') {
          return nodeRequire(name);
        }

        var err = new Error('Cannot find module \'' + name + '\'');
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      }

      localRequire.resolve = resolve;
      localRequire.cache = {};

      var module = cache[name] = new newRequire.Module(name);

      modules[name][0].call(module.exports, localRequire, module, module.exports, this);
    }

    return cache[name].exports;

    function localRequire(x){
      return newRequire(localRequire.resolve(x));
    }

    function resolve(x){
      return modules[name][1][x] || x;
    }
  }

  function Module(moduleName) {
    this.id = moduleName;
    this.bundle = newRequire;
    this.exports = {};
  }

  newRequire.isParcelRequire = true;
  newRequire.Module = Module;
  newRequire.modules = modules;
  newRequire.cache = cache;
  newRequire.parent = previousRequire;
  newRequire.register = function (id, exports) {
    modules[id] = [function (require, module) {
      module.exports = exports;
    }, {}];
  };

  var error;
  for (var i = 0; i < entry.length; i++) {
    try {
      newRequire(entry[i]);
    } catch (e) {
      // Save first error but execute all entries
      if (!error) {
        error = e;
      }
    }
  }

  if (entry.length) {
    // Expose entry point to Node, AMD or browser globals
    // Based on https://github.com/ForbesLindesay/umd/blob/master/template.js
    var mainExports = newRequire(entry[entry.length - 1]);

    // CommonJS
    if (typeof exports === "object" && typeof module !== "undefined") {
      module.exports = mainExports;

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
     define(function () {
       return mainExports;
     });

    // <script>
    } else if (globalName) {
      this[globalName] = mainExports;
    }
  }

  // Override the current require with this new one
  parcelRequire = newRequire;

  if (error) {
    // throw error from earlier, _after updating parcelRequire_
    throw error;
  }

  return newRequire;
})({"cE0t":[function(require,module,exports) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.patternToRegex = patternToRegex;
exports.patternValidationRegex = void 0;
// Copied from https://github.com/mozilla/gecko-dev/blob/073cc24f53d0cf31403121d768812146e597cc9d/toolkit/components/extensions/schemas/manifest.json#L487-L491
const patternValidationRegex = /^(https?|wss?|file|ftp|\*):\/\/(\*|\*\.[^*/]+|[^*/]+)\/.*$|^file:\/\/\/.*$|^resource:\/\/(\*|\*\.[^*/]+|[^*/]+)\/.*$|^about:/;
exports.patternValidationRegex = patternValidationRegex;

function getRawRegex(matchPattern) {
  if (!patternValidationRegex.test(matchPattern)) {
    throw new Error(matchPattern + ' is an invalid pattern, it must match ' + String(patternValidationRegex));
  }

  let [, protocol, host, pathname] = matchPattern.split(/(^[^:]+:[/][/])([^/]+)?/);
  protocol = protocol.replace('*', 'https?') // Protocol wildcard
  .replace(/[/]/g, '[/]'); // Escape slashes

  host = (host !== null && host !== void 0 ? host : ''). // Undefined for file:///
  replace(/[.]/g, '[.]') // Escape dots
  .replace(/^[*]/, '[^/]+') // Initial or only wildcard
  .replace(/[*]$/g, '[^.]+'); // Last wildcard

  pathname = pathname.replace(/[/]/g, '[/]') // Escape slashes
  .replace(/[.]/g, '[.]') // Escape dots
  .replace(/[*]/g, '.*'); // Any wildcard

  return '^' + protocol + host + '(' + pathname + ')?$';
}

function patternToRegex(...matchPatterns) {
  return new RegExp(matchPatterns.map(getRawRegex).join('|'));
}
},{}],"Focm":[function(require,module,exports) {
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

const webext_patterns_1 = require("webext-patterns"); // @ts-ignore


async function p(fn, ...args) {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    fn(...args, result => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

async function isOriginPermitted(url) {
  return p(chrome.permissions.contains, {
    origins: [new URL(url).origin + '/*']
  });
}

async function wasPreviouslyLoaded(tabId, loadCheck) {
  const result = await p(chrome.tabs.executeScript, tabId, {
    code: loadCheck,
    runAt: 'document_start'
  });
  return result === null || result === void 0 ? void 0 : result[0];
}

if (typeof chrome === 'object' && !chrome.contentScripts) {
  chrome.contentScripts = {
    // The callback is only used by webextension-polyfill
    async register(contentScriptOptions, callback) {
      const {
        js = [],
        css = [],
        allFrames,
        matchAboutBlank,
        matches,
        runAt
      } = contentScriptOptions; // Injectable code; it sets a `true` property on `document` with the hash of the files as key.

      const loadCheck = `document[${JSON.stringify(JSON.stringify({
        js,
        css
      }))}]`;
      const matchesRegex = webext_patterns_1.patternToRegex(...matches);

      const listener = async (tabId, {
        status
      }) => {
        if (status !== 'loading') {
          return;
        }

        const {
          url
        } = await p(chrome.tabs.get, tabId);

        if (!url || // No URL = no permission;
        !matchesRegex.test(url) || // Manual `matches` glob matching
        !(await isOriginPermitted(url)) || ( // Permissions check
        await wasPreviouslyLoaded(tabId, loadCheck)) // Double-injection avoidance
        ) {
            return;
          }

        for (const file of css) {
          chrome.tabs.insertCSS(tabId, { ...file,
            matchAboutBlank,
            allFrames,
            runAt: runAt !== null && runAt !== void 0 ? runAt : 'document_start' // CSS should prefer `document_start` when unspecified

          });
        }

        for (const file of js) {
          chrome.tabs.executeScript(tabId, { ...file,
            matchAboutBlank,
            allFrames,
            runAt
          });
        } // Mark as loaded


        chrome.tabs.executeScript(tabId, {
          code: `${loadCheck} = true`,
          runAt: 'document_start',
          allFrames
        });
      };

      chrome.tabs.onUpdated.addListener(listener);
      const registeredContentScript = {
        async unregister() {
          return p(chrome.tabs.onUpdated.removeListener.bind(chrome.tabs.onUpdated), listener);
        }

      };

      if (typeof callback === 'function') {
        callback(registeredContentScript);
      }

      return Promise.resolve(registeredContentScript);
    }

  };
}
},{"webext-patterns":"cE0t"}]},{},["Focm"], null)
//# sourceMappingURL=/index.js.map