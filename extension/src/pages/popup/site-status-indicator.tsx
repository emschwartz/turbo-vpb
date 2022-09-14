import { h, FunctionComponent } from "preact";
import { SiteStatus } from "../../lib/types";
import {
  XCircleIcon,
  CheckCircleIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";
import { browser, Tabs } from "webextension-polyfill-ts";
import { batch, signal } from "@preact/signals";
import {
  isVanWithCustomDomain,
  selectPhonebankType,
} from "../../lib/vpb-integrations";
import { EffectCallback, useEffect } from "preact/hooks";

const siteStatus = signal("unsupported" as SiteStatus);
const currentUrl = signal("");
async function getSiteStatus() {
  console.log("Checking site status");
  let activeTab: Tabs.Tab;
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    activeTab = tab;
  } catch (err) {
    throw new Error(`Error getting activeTab: ${err.message}`);
  }

  if (activeTab?.url) {
    let enabled: boolean;
    try {
      enabled = await browser.permissions.contains({
        origins: [activeTab.url],
      });
    } catch (err) {
      throw new Error(
        `Error checking permissions for URL: ${activeTab.url} ${err.message}`
      );
    }

    let status: SiteStatus;
    if (enabled) {
      status = "enabled";
    } else if (selectPhonebankType(activeTab.url)) {
      status = "disabled";
    } else if (activeTab.id && (await isVanWithCustomDomain(activeTab.id))) {
      status = "disabled";
    } else {
      status = "unsupported";
    }
    console.log("Site status", status);
    batch(() => {
      siteStatus.value = status;
      currentUrl.value = activeTab.url;
    });
  } else {
    console.log("No current tab");
  }
}
getSiteStatus().catch(console.error);

async function disableSite() {
  const removed = await browser.permissions.remove({
    origins: [currentUrl.value],
    permissions: [],
  });
  if (removed) {
    siteStatus.value = "disabled";
  }
}

async function enableSite() {
  if (currentUrl.value) {
    const granted = await browser.permissions.request({
      origins: [currentUrl.value],
    });
    if (granted) {
      siteStatus.value = "enabled";
    }
  }
}

const SiteStatusIndicator: FunctionComponent<{ class?: string }> = ({
  class: className,
}) => {
  useEffect(getSiteStatus as unknown as EffectCallback);

  const { text, icon, onClick } =
    siteStatus.value === "enabled"
      ? {
          text: "Enabled on this site",
          icon: <CheckCircleIcon style="text-green-700" />,
          onClick: disableSite,
        }
      : siteStatus.value === "disabled"
      ? {
          text: "Click to enable",
          icon: <PlusCircleIcon />,
          onClick: enableSite,
        }
      : {
          text: "Unsupported site",
          icon: <XCircleIcon class="text-gray-400" />,
          onClick: () => {},
        };

  return (
    <div class={className}>
      <a class="flex flex-col items-center" onClick={onClick}>
        {icon}
        <div class="text-center">{text}</div>
      </a>
    </div>
  );
};

export default SiteStatusIndicator;
