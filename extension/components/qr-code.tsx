import { Signal } from "@preact/signals";
import { FunctionComponent } from "preact";
import qrcode from "qrcode-generator";

const ConnectQrCode: FunctionComponent<{
  connectUrl: Signal<URL | undefined>;
  size?: number;
}> = ({ connectUrl, size = 200 }) => {
  if (!connectUrl.value) {
    return undefined;
  }

  const qr = qrcode(0, "L");
  qr.addData(connectUrl.value.toString());
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = size / moduleCount;

  const paths: string[] = [];
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        paths.push(
          `M${col * cellSize},${row * cellSize}h${cellSize}v${cellSize}h-${cellSize}z`,
        );
      }
    }
  }

  return (
    <div>
      <a href={connectUrl.value.href} target="_blank" rel="noopener noreferrer">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <rect width={size} height={size} fill="#FFFFFF" />
          <path d={paths.join("")} fill="#000000" />
        </svg>
      </a>
    </div>
  );
};

export default ConnectQrCode;
