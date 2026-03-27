import { FunctionComponent } from "preact";
import { ConnectionStatus } from "../lib/types";

const ConnectionStatusBadge: FunctionComponent<{
  status: ConnectionStatus;
  class?: string;
}> = ({ status, class: className }) => {
  if (status == "connectingToServer") {
    return (
      <span
        className={`rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-800 text-center ${className}`}
      >
        Connecting to server...
      </span>
    );
  } else if (status === "waitingForMessage") {
    return (
      <span
        className={`rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium text-blue-800 text-center ${className}`}
      >
        Scan QR code to connect
      </span>
    );
  } else if (status === "connected") {
    return (
      <span
        className={`rounded-full bg-green-100 px-2.5 py-0.5 text-sm font-medium text-green-800 text-center ${className}`}
      >
        Connected
      </span>
    );
  } else if (status === "disconnected") {
    return (
      <span
        className={`rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-800 text-center ${className}`}
      >
        Reconnecting...
      </span>
    );
  }
};

export default ConnectionStatusBadge;
