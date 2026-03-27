import { Signal } from "@preact/signals";
import { FunctionComponent } from "preact";
import QRCode from "react-qr-code";

// react-qr-code is a React class component; cast for Preact JSX compatibility
const QRCodeComponent = QRCode as unknown as FunctionComponent<{
  value: string;
  size?: number;
}>;

const ConnectQrCode: FunctionComponent<{
  connectUrl: Signal<URL | undefined>;
  size?: number;
}> = ({ connectUrl, size = 200 }) => {
  return connectUrl.value ? (
    <div>
      <a href={connectUrl.value.href} target="_blank" rel="noopener noreferrer">
        <QRCodeComponent value={connectUrl.value.toString()} size={size} />
      </a>
    </div>
  ) : undefined;
};

export default ConnectQrCode;
