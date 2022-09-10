import { h, render } from "preact";
import TurboVpbContainer from "../components/turbovpb-container";
import PubSubClient from "../lib/pubsub-client";

const serverBase = "http://localhost:8080";

const sidebar = document.getElementById("openvpbsidebarcontainer");
if (sidebar) {
  console.log("rendering turbovpb container");
  render(<TurboVpbContainer isConnected={true} />, sidebar);
} else {
  console.error("Could not find sidebar container");
}

async function connect() {
  const client = new PubSubClient(serverBase);
  await client.connect();
}
