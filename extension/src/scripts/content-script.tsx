import { h, render } from "preact";
import TurboVpbContainer from "../components/turbovpb-container";
import PubSubClient from "../lib/pubsub-client";
import { signal } from "@preact/signals";
import { ConnectionStatus } from "../lib/types";
import { randomId } from "../lib/crypto";
import { browser } from "webextension-polyfill-ts";

const serverBase = "http://localhost:8080";

const status = signal("connectinToServer" as ConnectionStatus);
const connectUrl = signal(undefined as URL | undefined);

const sidebar = document.getElementById("openvpbsidebarcontainer");
if (sidebar) {
  console.log("rendering turbovpb container");
  render(
    <TurboVpbContainer status={status} connectUrl={connectUrl} />,
    sidebar
  );
} else {
  console.error("Could not find sidebar container");
}

async function connect() {
  const sessionId = randomId(16);
  const client = new PubSubClient(serverBase);
  client.onopen = () => {
    console.log("connected");
    status.value = "waitingForMessage";
  };
  client.onclose = () => {
    status.value = "disconnected";
  };
  client.onerror = () => {
    status.value = "disconnected";
  };
  client.onmessage = async (message) => {
    status.value = "connected";

    if (message.type === "connect") {
      await client.send({
        type: "connectResponse",
      });
    }
  };
  await client.connect();

  // Build connect URL
  const encryptionKey = await client.exportEncryptionKey();
  const url = new URL("/connect", serverBase);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("version", browser.runtime.getManifest().version);
  url.searchParams.set("userAgent", encodeURIComponent(navigator.userAgent));
  url.searchParams.set("domain", encodeURIComponent(window.location.host));
  url.hash = `${client.channelId}&${encryptionKey}`;

  console.log("connect url", url.toString());

  connectUrl.value = url;
}

connect().catch(console.error);
