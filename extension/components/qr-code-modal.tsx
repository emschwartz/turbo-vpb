import { FunctionComponent } from "preact";
import { useEffect, useCallback } from "preact/hooks";
import { ReadonlySignal, Signal } from "@preact/signals";
import { XMarkIconOutline as XMarkIcon } from "./icons";
import { ConnectionStatus } from "../lib/types";
import ConnectionStatusBadge from "./connection-status-badge";
import ConnectQrCode from "./qr-code";
import TurboVpbIcon from "./turbovpb-icon";

const QrCodeModal: FunctionComponent<{
  open: Signal<boolean>;
  status: Signal<ConnectionStatus>;
  connectUrl: ReadonlySignal<URL | undefined>;
}> = ({ open, status, connectUrl }) => {
  const close = useCallback(() => {
    open.value = false;
  }, [open]);

  useEffect(() => {
    if (!open.value) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open.value, close]);

  if (!open.value) return null;

  return (
    <div class="relative z-[1000]" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        class="fixed inset-0 bg-slate-500/75 transition-opacity"
        onClick={close}
      />

      {/* Modal */}
      <div class="fixed inset-0 z-[1000] overflow-y-auto">
        <div class="flex p-4 text-center sm:items-center sm:p-0">
          <div class="relative transform overflow-hidden rounded-lg border border-slate-200 p-4 bg-white text-center shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6">
            <div class="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
              <button
                type="button"
                class="rounded-lg bg-white text-slate-400 hover:text-slate-500 focus:outline-none"
                onClick={close}
              >
                <span class="sr-only">Close</span>
                <XMarkIcon class="h-6 w-6" aria-hidden={true} />
              </button>
            </div>
            <div class="flex flex-col flex-shrink mx-auto place-content-center space-y-4 p-4">
              <div>
                <h2 class="leading-6 text-slate-900">
                  <div class="inline-flex items-center align-middle place-items-center mx-auto">
                    <TurboVpbIcon class="w-8" />
                    <span class="ml-3 text-4xl font-semibold">TurboVPB</span>
                  </div>
                </h2>
              </div>
              <ConnectionStatusBadge status={status.value} class="text-lg" />
              <ConnectQrCode connectUrl={connectUrl} size={300} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QrCodeModal;
