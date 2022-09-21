import { FunctionComponent, Fragment } from "preact";
import { Dialog, Transition } from "@headlessui/react";
import { ReadonlySignal, Signal } from "@preact/signals";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { ConnectionStatus } from "../lib/types";
import ConnectionStatusBadge from "./connection-status-badge";
import ConnectQrCode from "./qr-code";
import TurboVpbIcon from "./turbovpb-icon";

const QrCodeModal: FunctionComponent<{
  open: Signal<boolean>;
  status: Signal<ConnectionStatus>;
  connectUrl: ReadonlySignal<URL | undefined>;
}> = ({ open, status, connectUrl }) => (
  <Transition.Root show={open.value} as={Fragment}>
    <Dialog
      class="relative z-1000"
      onClose={() => (open.value = false)}
      initialFocus={null}
    >
      <Transition.Child
        as={Fragment}
        enter="ease-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
      </Transition.Child>

      <div class="fixed inset-0 z-1000 overflow-y-auto">
        <div class="flex p-4 text-center sm:items-center sm:p-0">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <Dialog.Panel class="relative transform overflow-hidden rounded-lg p-4 bg-white text-center shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6">
              <div class="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
                <button
                  type="button"
                  class="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                  onClick={() => (open.value = false)}
                >
                  <span class="sr-only">Close</span>
                  <XMarkIcon class="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <div class="flex flex-col flex-shrink mx-auto place-content-center space-y-4 p-4">
                <div>
                  <Dialog.Title class="leading-6 text-gray-900">
                    <div class="inline-flex items-center align-middle place-items-center mx-auto">
                      <TurboVpbIcon class="w-8" />
                      <span class="ml-3 text-4xl font-light">TurboVPB</span>
                    </div>
                  </Dialog.Title>
                </div>
                <ConnectionStatusBadge status={status.value} class="text-lg" />
                <ConnectQrCode connectUrl={connectUrl} size={300} />
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </div>
    </Dialog>
  </Transition.Root>
);

export default QrCodeModal;
