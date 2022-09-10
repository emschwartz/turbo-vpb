import { h, render } from "preact";
import TurboVpbContainer from "../components/turbovpb-container";
import PubSubClient from "../lib/pubsub-client";
import { signal } from "@preact/signals";

const serverBase = "http://localhost:8080";

const isConnected = signal(false);

const sidebar = document.getElementById("openvpbsidebarcontainer");
if (sidebar) {
  console.log("rendering turbovpb container");
  render(<TurboVpbContainer isConnected={isConnected} />, sidebar);
} else {
  console.error("Could not find sidebar container");
}

async function connect() {
  const client = new PubSubClient(serverBase);
  client.onopen = () => {
    console.log("connected");
    isConnected.value = true;
  };
  client.onclose = () => {
    isConnected.value = false;
  };
  client.onerror = () => {
    isConnected.value = false;
  };
  await client.connect();
  isConnected.value = true;
}

connect().catch(console.error);
