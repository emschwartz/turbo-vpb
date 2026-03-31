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
 * Install a temporary addon in a running Firefox instance via RDP.
 * The extension at `addonPath` gets full permissions (no user prompt).
 */
export async function installTemporaryAddon(
  rdpPort: number,
  addonPath: string,
): Promise<void> {
  const client = await connectWithRetries(rdpPort);
  try {
    // Get the root actor
    const root = await client.request("getRoot");
    const addonsActor = root.addonsActor;
    if (!addonsActor) {
      throw new Error("Firefox does not provide an addons actor");
    }

    // Install the addon
    const result = await client.request({
      to: addonsActor,
      type: "installTemporaryAddon",
      addonPath,
    });
    if (result.error) {
      throw new Error(
        `installTemporaryAddon failed: ${result.error}: ${result.message}`,
      );
    }
  } finally {
    client.disconnect();
  }
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
