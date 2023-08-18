import { batch, signal } from "@preact/signals";
import { FunctionComponent } from "preact";
import browser from "webextension-polyfill";
import {
  PlusCircleIcon,
  XCircleIcon,
  QrCodeIcon,
} from "@heroicons/react/24/outline";
import { isVanWithCustomDomain } from "../../lib/vpb-integrations";
import WhiteButton from "./white-button";

const tabStatus = signal("enabled" as "enabled" | "disabled" | "unsupported");
const origin = signal(undefined as string | undefined);
const domain = signal(undefined as string | undefined);

async function checkCurrentTab() {
  const activeTab = await getActiveTab();
  const tabOrigin = urlToOrigin(activeTab.url);
  const enabled = await browser.permissions.contains({
    origins: [tabOrigin],
  });
  let isVan = false;
  if (!enabled) {
    isVan = await isVanWithCustomDomain(activeTab.id);
  }

  batch(() => {
    tabStatus.value = enabled ? "enabled" : isVan ? "disabled" : "unsupported";
    domain.value = new URL(activeTab.url).hostname.replace(/^www\./, "");
    origin.value = tabOrigin;
  });
}
checkCurrentTab();
browser.permissions.onAdded.addListener(checkCurrentTab);

async function openQrCodeModal() {
  browser.tabs.sendMessage((await getActiveTab()).id, {
    type: "openQrCodeModal",
  });
  window.close();
}

async function getActiveTab() {
  const activeTabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  return activeTabs[0];
}

async function requestPermission() {
  console.log("Requesting permission for:", origin.value);
  const result = await browser.permissions.request({ origins: [origin.value] });
  console.log("Permission request ", result ? "granted" : "denied");
  return result;
}

function urlToOrigin(url: string) {
  const u = new URL(url);
  // Note it's important that the origin does not include the port
  return `${u.protocol}//${u.hostname}/*`;
}

const SiteStatusIndicator: FunctionComponent = () =>
  tabStatus.value === "enabled" ? (
    <WhiteButton
      text="Open QR Code"
      icon={<QrCodeIcon />}
      onClick={openQrCodeModal}
    />
  ) : tabStatus.value === "disabled" ? (
    <WhiteButton
      text={`Enable on ${domain.value || "this site"}`}
      icon={<PlusCircleIcon />}
      onClick={requestPermission}
    />
  ) : (
    <button
      title={`TurboVPB is not available on ${domain}`}
      class="inline-flex items-center rounded-md border border-gray-300 bg-gray-100 px-6 py-3 text-base font-medium text-gray-700 shadow-sm focus:outline-none"
      disabled
    >
      <div class="-ml-1 mr-3 h-6 w-6 flex-shrink-0">
        <XCircleIcon class="bg-inherit" />
      </div>
      Unsupported Site
    </button>
  );

export default SiteStatusIndicator;
