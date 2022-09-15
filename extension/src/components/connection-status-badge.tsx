import { FunctionComponent } from "preact";
import { ConnectionStatus } from "../lib/types";

const ConnectionStatusBadge: FunctionComponent<{
  status: ConnectionStatus;
  class?: string;
}> = ({ status, class: className }) => {
  if (status == "connectingToServer") {
    return (
      <span
        className={`rounded-md bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-800 ${className}`}
      >
        Connecting to server...
      </span>
    );
  } else if (status === "waitingForMessage") {
    return (
      <span
        className={`rounded-md bg-blue-100 px-2.5 py-0.5 text-sm font-medium text-blue-800 ${className}`}
      >
        Scan QR code to connect
      </span>
    );
  } else if (status === "connected") {
    return (
      <span
        className={`rounded-md bg-green-100 px-2.5 py-0.5 text-sm font-medium text-green-800 ${className}`}
      >
        Connected
      </span>
    );
  } else if (status === "disconnected") {
    return (
      <span
        className={`rounded-md bg-red-100 px-2.5 py-0.5 text-sm font-medium text-red-800 ${className}`}
      >
        Disconnected
      </span>
    );
  }
};

export default ConnectionStatusBadge;
