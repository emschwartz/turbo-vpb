import { h, render } from "preact";
import TurboVpbContainer from "../components/turbovpb-container";

const sidebar = document.getElementById("openvpbsidebarcontainer");
if (sidebar) {
  console.log("rendering turbovpb container");
  render(<TurboVpbContainer isConnected={true} />, sidebar);
} else {
  console.error("Could not find sidebar container");
}
