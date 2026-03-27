import { Signal } from "@preact/signals";
import { FunctionComponent } from "preact";
import QRCode from "react-qr-code";

const ConnectQrCode: FunctionComponent<{
  connectUrl: Signal<URL | undefined>;
  size?: number;
}> = ({ connectUrl, size = 200 }) => {
  return connectUrl.value ? (
    <div>
      <a href={connectUrl.value.href} target="_blank" rel="noopener noreferrer">
        <QRCode value={connectUrl.value.toString()} size={size} />
      </a>
    </div>
  ) : undefined;
};

export default ConnectQrCode;
