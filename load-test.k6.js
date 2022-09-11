import ws from "k6/ws";
import { check, fail } from "k6";
import { b64encode } from "k6/encoding";
import { randomBytes } from "k6/crypto";
import exec from "k6/execution";
import { SharedArray } from "k6/data";

const MESSAGE_SIZE = 10000;
const SERVER_URL = "wss://next.turbovpb.com";
// const SERVER_URL = "ws://localhost:8080";
const WS_TIMEOUT = 2000;

const newRandomMessage = () =>
  Array.from(new Uint8Array(randomBytes(MESSAGE_SIZE)));
const extensionMessage = new SharedArray("extensionMessage", newRandomMessage);
const browserMessage = new SharedArray("browserMessage", newRandomMessage);

export let options = {
  stages: [{ duration: "10s", target: 2000 }],
};

export default function () {
  const identity =
    exec.scenario.iterationInTest % 2 === 0 ? "extension" : "browser";
  const channelId = `test-${Math.floor(exec.scenario.iterationInTest / 2)}`;
  const url = `${SERVER_URL}/api/channels/${channelId}/${identity}`;

  const [toSend, toReceive] = new Uint8Array(
    identity === "extension"
      ? [extensionMessage, browserMessage]
      : [browserMessage, extensionMessage]
  );
  const res = ws.connect(url, null, (socket) => {
    if (identity === "browser") {
      socket.on("open", () => socket.sendBinary(toSend.buffer));
    }
    socket.on("binaryMessage", (message) => {
      if (identity === "extension") {
        socket.sendBinary(messageToSend.buffer);
      }

      check(message, {
        "got expected message": (message) =>
          b64encode(message) === b64encode(toReceive.buffer),
      });

      socket.close();
    });
    socket.on("error", fail);
    socket.setTimeout(() => socket.close(), WS_TIMEOUT);
  });
  check(res, {
    "status is 101": (r) => r && r.status === 101,
  });
}
