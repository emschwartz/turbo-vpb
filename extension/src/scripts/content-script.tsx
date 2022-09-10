import { h, render } from "preact";
import TurboVpbContainer from "../components/turbovpb-container";
import PubSubClient from "../lib/pubsub-client";
import { signal } from "@preact/signals";
import { ConnectionStatus } from "../lib/types";

const serverBase = "http://localhost:8080";

const status = signal("connectinToServer" as ConnectionStatus);

const sidebar = document.getElementById("openvpbsidebarcontainer");
if (sidebar) {
  console.log("rendering turbovpb container");
  render(<TurboVpbContainer status={status} />, sidebar);
} else {
  console.error("Could not find sidebar container");
}

async function connect() {
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
  client.onmessage = (message) => {
    status.value = "connected";
  };
  await client.connect();
}

connect().catch(console.error);
