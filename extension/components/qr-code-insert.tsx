import { FunctionComponent } from "preact";
import { Signal } from "@preact/signals";
import { ConnectionStatus, ScrapeConfidence } from "../lib/types";
import ConnectionStatusBadge from "./connection-status-badge";
import ConnectQrCode from "./qr-code";
import TurboVpbLogoAndName from "./turbovpb-logo-and-name";

const QrCodeInsert: FunctionComponent<{
  hide: Signal<boolean>;
  connectUrl: Signal<URL | undefined>;
  status: Signal<ConnectionStatus>;
  scrapingConfidence: Signal<ScrapeConfidence>;
}> = ({ hide, connectUrl, status, scrapingConfidence }) => {
  if (hide.value) return null;

  return (
    <div class="flex flex-row flex-shrink m-2">
      <div class="grid grid-cols-1 place-items-center space-y-2 mx-auto my-2 py-2.5 px-3 text-slate-700 border border-slate-200 rounded-lg bg-white">
        <TurboVpbLogoAndName />
        <ConnectionStatusBadge status={status.value} />
        {scrapingConfidence.value === "low" && (
          <p class="text-xs text-amber-600">
            Contact details may be incomplete
          </p>
        )}
        {status.value === "phoneAway" ? (
          // The phone reconnects by itself, so keep the QR code out of the
          // way, but available in case the volunteer needs to re-scan
          <details class="text-center text-xs text-slate-500">
            <summary class="cursor-pointer">Show QR code</summary>
            <ConnectQrCode connectUrl={connectUrl} size={200} />
          </details>
        ) : status.value !== "connected" && status.value !== "reloadPage" ? (
          <ConnectQrCode connectUrl={connectUrl} size={200} />
        ) : null}
      </div>
    </div>
  );
};

export default QrCodeInsert;
