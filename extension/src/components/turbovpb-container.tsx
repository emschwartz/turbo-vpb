import { h, FunctionComponent } from "preact";
import { Signal, computed } from "@preact/signals";

const ConnectionStatus: FunctionComponent<{ isConnected: boolean }> = ({
  isConnected,
}) => {
  const color = isConnected
    ? "color: #fff; background-color: #28a745;"
    : "color: #000; background-color: #ffc107;";
  const text = isConnected ? "Connected" : "Waiting to connect...";

  return (
    <span style={`font-weight: bold; ${color}`} class="badge px-1">
      {text}
    </span>
  );
};

const TurboVpbContainer: FunctionComponent<{
  isConnected: Signal<boolean>;
}> = ({ isConnected }) => {
  return (
    <div
      id="turbovpbcontainer"
      style="margin-top: 2rem"
      class="openvpb-sidebar-content"
    >
      <hr style="margin-bottom: 2rem" />

      <div style="display: flex; align-items: center">
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
        <span style="padding-left:.3rem; padding-right: .3rem; padding-top: .1rem; font-size: 1.17em; font-weight: bold; color: #000;">
          TurboVPB
        </span>
        <ConnectionStatus isConnected={isConnected.value} />
      </div>
    </div>
  );
};

export default TurboVpbContainer;
