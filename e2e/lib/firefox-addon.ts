/**
 * Minimal Firefox Remote Debugging Protocol client for installing
 * temporary addons in Playwright's Firefox.
 *
 * Playwright doesn't natively support loading Firefox extensions.
 * This module connects to Firefox's RDP server and uses the
 * `installTemporaryAddon` command to load the extension with full
 * permissions (temporary addons get all requested permissions).
 *
 * Based on the technique from web-ext and playwright-webextext.
 */
import net from "node:net";

/**
 * Firefox prefs required for RDP-based addon installation.
 * Merge these into your `firefoxUserPrefs` when launching Firefox.
 */
export function firefoxExtensionPrefs(
  rdpPort: number,
  extraPrefs: Record<string, string | number | boolean> = {},
): Record<string, string | number | boolean> {
  return {
    // Enable remote debugging server
    "devtools.debugger.remote-enabled": true,
    "devtools.debugger.prompt-connection": false,
    // Allow unsigned extensions (Playwright's Firefox is Nightly-based)
    "xpinstall.signatures.required": false,
    // Enable MV3
    "extensions.manifestV3.enabled": true,
    ...extraPrefs,
  };
}

/**
 * Firefox launch args to start the RDP server on the given port.
 */
export function firefoxExtensionArgs(rdpPort: number): string[] {
  return ["--start-debugger-server", String(rdpPort)];
}

/**
 * Result from installing a temporary addon. Provides the extension's
 * internal UUID and a method to evaluate JS in its background context.
 */
export interface InstalledAddon {
  uuid: string;
  evaluate: (expression: string) => Promise<any>;
  disconnect: () => void;
}

/**
 * Install a temporary addon in a running Firefox instance via RDP.
 * The extension at `addonPath` gets full permissions (no user prompt).
 *
 * Returns an InstalledAddon with the extension UUID and an evaluate()
 * function for running JS in the extension's background context.
 * Call disconnect() when done setting up.
 */
export async function installTemporaryAddon(
  rdpPort: number,
  addonPath: string,
  geckoId: string,
): Promise<InstalledAddon> {
  const client = await connectWithRetries(rdpPort);

  // Get the root actor
  const root = await client.request("getRoot");
  const addonsActor = root.addonsActor;
  if (!addonsActor) {
    throw new Error("Firefox does not provide an addons actor");
  }

  // Install the addon
  const installResult = await client.request({
    to: addonsActor,
    type: "installTemporaryAddon",
    addonPath,
  });
  if (installResult.error) {
    throw new Error(
      `installTemporaryAddon failed: ${installResult.error}: ${installResult.message}`,
    );
  }

  // Get the extension's internal UUID from Firefox prefs
  const prefResult = await client.request({
    to: root.preferenceActor,
    type: "getCharPref",
    value: "extensions.webextensions.uuids",
  });
  const uuids: Record<string, string> = JSON.parse(prefResult.value || "{}");
  const uuid = uuids[geckoId];
  if (!uuid) {
    throw new Error(
      `Could not find UUID for ${geckoId} in extensions.webextensions.uuids`,
    );
  }

  // Find the addon's console actor so we can evaluate JS in its context.
  const listResult = await client.request("listAddons");
  const addon = listResult.addons?.find((a: any) => a.id === geckoId);

  // Get a console actor for the addon's background context.
  // The addon's actor is a webExtensionDescriptor. In newer Firefox (109+),
  // we use getWatcher to get a Watcher actor, then watch for console messages.
  // As a simpler approach, we use the descriptor's getTarget or connect methods.
  let consoleActor: string | undefined;
  if (addon?.actor) {
    // Try different RDP commands to get the addon's console
    for (const cmd of ["getWatcher", "connect", "getTarget"]) {
      try {
        const result = await client.request({
          to: addon.actor,
          type: cmd,
        });
        if (result.consoleActor) {
          consoleActor = result.consoleActor;
          break;
        }
        // getWatcher returns a watcher actor that can provide resources
        if (result.actor && cmd === "getWatcher") {
          // Use the watcher to get the console target
          const resources = await client.request({
            to: result.actor,
            type: "watchResources",
            resourceTypes: ["console-message"],
          });
          consoleActor = resources?.consoleActor;
          if (consoleActor) break;
        }
      } catch {
        // Command not supported, try next
      }
    }
  }

  return {
    uuid,
    async evaluate(expression: string): Promise<any> {
      if (!consoleActor) {
        throw new Error("No console actor available for the addon");
      }
      const result = await client.request({
        to: consoleActor,
        type: "evaluateJSAsync",
        text: expression,
      });
      // evaluateJSAsync returns a resultID, then we get the actual result
      if (result.resultID) {
        // For async results, we need to wait. The result is sent as a
        // separate message. For simplicity, poll via a follow-up request.
        // Actually, evaluateJSAsync returns the result directly in newer Firefox.
      }
      if (result.exception) {
        throw new Error(`Extension eval error: ${JSON.stringify(result.exception)}`);
      }
      return result.result;
    },
    disconnect() {
      client.disconnect();
    },
  };
}

// --- Minimal RDP client ---

interface RDPRequest {
  to: string;
  type: string;
  [key: string]: unknown;
}

interface RDPClient {
  request(req: string | RDPRequest): Promise<any>;
  disconnect(): void;
}

async function connectWithRetries(
  port: number,
  maxRetries = 50,
  retryInterval = 200,
): Promise<RDPClient> {
  let lastError: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await connectRDP(port);
    } catch (err: any) {
      if (err?.code === "ECONNREFUSED") {
        lastError = err;
        await new Promise((r) => setTimeout(r, retryInterval));
      } else {
        throw err;
      }
    }
  }
  throw lastError || new Error("Failed to connect to Firefox RDP");
}

function connectRDP(port: number): Promise<RDPClient> {
  return new Promise((resolve, reject) => {
    let incoming = Buffer.alloc(0);
    const pending: Array<{
      resolve: (v: any) => void;
      reject: (e: any) => void;
    }> = [];
    let waitingForRoot:
      | { resolve: (v: any) => void; reject: (e: any) => void }
      | undefined = { resolve: onRoot, reject };

    const conn = net.createConnection({ port, host: "127.0.0.1" });
    conn.on("data", onData);
    conn.on("error", reject);

    function onRoot(_rootMsg: any) {
      resolve({
        request(req: string | RDPRequest) {
          const msg: RDPRequest =
            typeof req === "string"
              ? { to: "root", type: req }
              : req;
          return new Promise((res, rej) => {
            pending.push({ resolve: res, reject: rej });
            const json = JSON.stringify(msg);
            const encoded = `${Buffer.byteLength(json)}:${json}`;
            conn.write(encoded);
          });
        },
        disconnect() {
          conn.end();
        },
      });
    }

    function onData(data: Buffer) {
      incoming = Buffer.concat([incoming, data]);
      // Parse all complete messages
      while (true) {
        const str = incoming.toString();
        const sepIdx = str.indexOf(":");
        if (sepIdx < 1) break;
        const byteLen = parseInt(str.slice(0, sepIdx));
        if (isNaN(byteLen)) break;
        const dataStart = sepIdx + 1;
        if (incoming.length - dataStart < byteLen) break;

        const msgBuf = incoming.slice(dataStart, dataStart + byteLen);
        incoming = incoming.slice(dataStart + byteLen);

        try {
          const msg = JSON.parse(msgBuf.toString());
          if (waitingForRoot) {
            const cb = waitingForRoot;
            waitingForRoot = undefined;
            cb.resolve(msg);
          } else if (pending.length > 0) {
            const cb = pending.shift()!;
            if (msg.error) {
              cb.reject(msg);
            } else {
              cb.resolve(msg);
            }
          }
        } catch {
          // Skip unparseable messages
        }
      }
    }
  });
}
