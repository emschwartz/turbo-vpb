import { h, FunctionComponent, VNode } from "preact";
import { Signal, ReadonlySignal } from "@preact/signals";
import { ConnectionStatus, PhonebankType } from "../lib/types";
import QRCode from "react-qr-code";
import TurboVpbLogoAndName from "./turbovpb-logo-and-name";
import "../index.css";

const ConnectionStatusBadge: FunctionComponent<{
  status: ConnectionStatus;
}> = ({ status }) => {
  if (status == "connectingToServer") {
    return (
      <span className="rounded-md bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-800">
        Connecting to server...
      </span>
    );
  } else if (status === "waitingForMessage") {
    return (
      <span className="rounded-md bg-blue-100 px-2.5 py-0.5 text-sm font-medium text-blue-800">
        Scan QR code to connect
      </span>
    );
  } else if (status === "connected") {
    return (
      <span className="rounded-md bg-green-100 px-2.5 py-0.5 text-sm font-medium text-green-800">
        Connected
      </span>
    );
  } else if (status === "disconnected") {
    return (
      <span className="rounded-md bg-red-100 px-2.5 py-0.5 text-sm font-medium text-red-800">
        Disconnected
      </span>
    );
  }
};

const ConnectQrCode: FunctionComponent<{
  connectUrl: Signal<URL | undefined>;
}> = ({ connectUrl }) =>
  connectUrl.value ? (
    <div>
      <a href={connectUrl.value.href} target="_blank" rel="noopener noreferrer">
        <QRCode value={connectUrl.value.toString()} size={200} />
      </a>
    </div>
  ) : undefined;

const OpenVpbContainer: FunctionComponent<{
  children: VNode;
}> = ({ children }) => (
  <div
    id="turbovpbcontainer"
    style="margin-top: 2rem"
    class="openvpb-sidebar-content"
  >
    <hr style="margin-bottom: 2rem" />

    <div style="display: flex; align-items: center">{children}</div>
  </div>
);

const EveryActionContainer: FunctionComponent<{
  children: VNode;
}> = ({ children }) => (
  <div
    id="turbovpbcontainer"
    class="col-lg-6 col-md-6 col-sm-12 margin-right-tiny"
  >
    <div class="panel panel-details panel-default">
      <div class="panel-content">{children}</div>
    </div>
  </div>
);

const BlueVoteContainer: FunctionComponent<{
  children: VNode;
}> = ({ children }) => (
  <div id="turbovpbcontainer" class="additional-info">
    <div class="mb-20">{children}</div>
  </div>
);

/**
 * Returns the TurboVPB container component, with the style adjusted for the phonebank platform.
 */
const TurboVpbContainer: FunctionComponent<{
  phonebankType: PhonebankType;
  status: Signal<ConnectionStatus>;
  connectUrl: ReadonlySignal<URL | undefined>;
}> = ({ phonebankType, status, connectUrl }) => (
  <div class="flex flex-row flex-shrink m-2">
    <div class="flex flex-col items-center space-y-2 m-auto rounded border border-gray-300 bg-white p-2.5 text-gray-700 shadow-sm">
      <TurboVpbLogoAndName />
      <ConnectionStatusBadge status={status.value} />
      <ConnectQrCode connectUrl={connectUrl} />
    </div>
  </div>
);

export default TurboVpbContainer;
