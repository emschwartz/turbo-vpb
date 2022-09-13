console.log("Content script loaded");
import browser from "webextension-polyfill";
import kjua from "kjua";

// We set these colors manually instead of using the Bootstrap classes
// because OpenVPB overrides the default Bootstrap colors
const SUCCESS_COLOR = "#28a745";
const WARNING_COLOR = "#ffc107";
const ERROR_COLOR = "#dc3545";

let modal;
let modalOpenedTime;

browser.runtime.onMessage.addListener(async (message) => {
  if (message.type === "contactRequest") {
    console.log("got contact request from background");
    sendDetails();
  } else if (message.type === "callResult") {
    markResult(message.result);
  } else if (message.type === "peerConnected") {
    console.log("peer connected");
    window.sessionStorage.setItem("turboVpbHideModal", "true");

    // If the user manually opened the QR code, don't hide it right away
    if (modal && modal.isOpen() && Date.now() - modalOpenedTime > 100) {
      console.log("closing qr code modal");
      modal.close();
    }
    isConnected = true;
    const badges = document.getElementsByClassName("turboVpbConnectionStatus");
    for (let connectionStatus of badges) {
      connectionStatus.innerText = "Connected";
      connectionStatus.style = `color: #fff; background-color: ${SUCCESS_COLOR}`;
    }
  } else if (message.type === "peerDisconnected") {
    console.log("peer disconnected");
    isConnected = false;
    const badges = document.getElementsByClassName("turboVpbConnectionStatus");
    for (let connectionStatus of badges) {
      connectionStatus.innerText = "Not Connected";
      connectionStatus.style = `color: #000; background-color: ${WARNING_COLOR}`;
    }
  } else if (message.type === "peerError") {
    isConnected = false;
    const badges = document.getElementsByClassName("turboVpbConnectionStatus");
    for (let connectionStatus of badges) {
      connectionStatus.innerText = "Error. Close Tab & Re-Open.";
      connectionStatus.style = `color: #000; background-color: ${ERROR_COLOR}`;
    }
  } else if (message.type === "showQrCode") {
    console.log("showing qr code");
    showModal();
  } else if (message.type === "updateConnectUrl") {
    await updateConnectUrl();
  } else {
    console.warn("got unexpected message from background:", message);
  }
});

window.addEventListener("focus", updateConnectUrl);

if (!window.sessionStorage.getItem("turboVpbHideModal")) {
  // Only create the modal after the page is fully loaded
  const watchForReady = setInterval(() => {
    if (document.getElementById("turbovpbcontainer")) {
      clearInterval(watchForReady);
      showModal();
    }
  }, 50);
}

export function showModal() {
  if (modal && modal.isOpen()) {
    console.log("modal is already open");
    return;
  }
  console.log("creating modal");
  modal = new tingle.modal({
    closeMethods: ["overlay", "escape", "button"],
  });

  const modalContent = document.createElement("div");

  const modalTitle = createTitleElement();
  modalContent.appendChild(modalTitle);

  const modalBody = document.createElement("div");
  modalBody.style = "margin-top: 1rem;";
  // modalTitle.className = 'modal-title'
  // modalBody.className = 'modal-body text-center pb-0'
  const label = document.createElement("p");
  label.innerHTML =
    "Scan the QR code with your phone's <br> default camera app to start TurboVPB:";
  label.style = "text-align: center;";
  modalBody.appendChild(label);

  const qrCode = createQrCode({ height: "50vh", width: "50vh" });
  qrCode.style = "max-height: 500px; max-width: 500px";
  modalBody.appendChild(qrCode);

  modalContent.appendChild(modalBody);

  modal.setContent(modalContent);
  modal.open();

  modalOpenedTime = Date.now();
}
