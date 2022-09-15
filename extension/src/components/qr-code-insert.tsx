import { Fragment, FunctionComponent } from "preact";
import { Signal } from "@preact/signals";
import { Transition } from "@headlessui/react";
import { ConnectionStatus } from "../lib/types";
import ConnectionStatusBadge from "./connection-status-badge";
import ConnectQrCode from "./qr-code";
import TurboVpbLogoAndName from "./turbovpb-logo-and-name";

const QrCodeInsert: FunctionComponent<{
  hide: Signal<boolean>;
  connectUrl: Signal<URL | undefined>;
  status: Signal<ConnectionStatus>;
}> = ({ hide, connectUrl, status }) => (
  <Transition
    show={!hide.value}
    as={Fragment}
    enter="transition-opacity duration-75"
    enterFrom="opacity-0"
    enterTo="opacity-100"
    leave="transition-opacity duration-150"
    leaveFrom="opacity-100"
    leaveTo="opacity-0"
  >
    <div class="flex flex-row flex-shrink m-2">
      <div class="flex flex-col items-center space-y-2 m-auto p-2.5 text-gray-700 shadow-sm">
        <TurboVpbLogoAndName />
        <ConnectionStatusBadge status={status.value} />
        <Transition
          show={status.value !== "connected"}
          as={Fragment}
          enter="transition-opacity duration-75"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <ConnectQrCode connectUrl={connectUrl} size={200} />
        </Transition>
      </div>
    </div>
  </Transition>
);

export default QrCodeInsert;
