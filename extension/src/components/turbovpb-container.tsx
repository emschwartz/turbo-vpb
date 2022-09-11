import { h, FunctionComponent, VNode } from "preact";
import { Signal, ReadonlySignal } from "@preact/signals";
import { ConnectionStatus, PhonebankType } from "../lib/types";
import QRCode from "react-qr-code";

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

const PhoneIcon: FunctionComponent = () => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 16 16"
    class="bi bi-telephone-outbound-fill"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill-rule="evenodd"
      d="M2.267.98a1.636 1.636 0 0 1 2.448.152l1.681 2.162c.309.396.418.913.296 1.4l-.513 2.053a.636.636 0 0 0 .167.604L8.65 9.654a.636.636 0 0 0 .604.167l2.052-.513a1.636 1.636 0 0 1 1.401.296l2.162 1.681c.777.604.849 1.753.153 2.448l-.97.97c-.693.693-1.73.998-2.697.658a17.471 17.471 0 0 1-6.571-4.144A17.47 17.47 0 0 1 .639 4.646c-.34-.967-.035-2.004.658-2.698l.97-.969zM11 .5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V1.707l-4.146 4.147a.5.5 0 0 1-.708-.708L14.293 1H11.5a.5.5 0 0 1-.5-.5z"
    />
  </svg>
);

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
      <PhoneIcon />
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
