import { h, FunctionComponent, VNode } from "preact";
import { Signal, ReadonlySignal } from "@preact/signals";
import { ConnectionStatus, PhonebankType } from "../lib/types";
import QRCode from "react-qr-code";
import TurboVpbIcon from "./turbovpb-icon";

const ConnectionStatusBadge: FunctionComponent<{
  status: ConnectionStatus;
}> = ({ status }) => {
  const color =
    status === "connected"
      ? "color: #fff; background-color: #28a745;"
      : "color: #000; background-color: #ffc107;";
  let text = "Connecting to server...";
  if (status === "connected") {
    text = "Connected";
  } else if (status === "disconnected") {
    text = "Disconnected";
  } else if (status === "waitingForMessage") {
    text = "Waiting for connection...";
  }

  return (
    <span style={`font-weight: bold; ${color}`} class="badge px-1">
      {text}
    </span>
  );
};

const ConnectQrCode: FunctionComponent<{
  connectUrl: Signal<URL | undefined>;
}> = ({ connectUrl }) =>
  connectUrl.value ? (
    <div style="width: 100%; height: 100%; max-width: 30vh; max-height: 30vh;">
      <a href={connectUrl.value.href} target="_blank" rel="noopener noreferrer">
        <QRCode value={connectUrl.value.toString()} />
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
}> = ({ phonebankType, status, connectUrl }) => {
  const inner = (
    <>
      <TurboVpbIcon />
      <span style="padding-left:.3rem; padding-right: .3rem; padding-top: .1rem; font-size: 1.17em; font-weight: bold; color: #000;">
        TurboVPB
      </span>
      <ConnectionStatusBadge status={status.value} />
      <ConnectQrCode connectUrl={connectUrl} />
    </>
  );

  if (phonebankType === "openvpb") {
    return <OpenVpbContainer>{inner}</OpenVpbContainer>;
  } else if (phonebankType === "everyaction") {
    <EveryActionContainer>{inner}</EveryActionContainer>;
  } else if (phonebankType === "bluevote") {
    <BlueVoteContainer>{inner}</BlueVoteContainer>;
  }
};

export default TurboVpbContainer;
