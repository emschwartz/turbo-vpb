import { h, FunctionComponent } from "preact";
import TurboVpbIcon from "../components/turbovpb-icon";
import {
  StarIcon,
  LightBulbIcon,
  LifebuoyIcon,
} from "@heroicons/react/24/outline";
import { ChatBubbleLeftRightIcon, QrCodeIcon } from "@heroicons/react/24/solid";
import "../scss/main.scss";
import { batch, signal, useComputed } from "@preact/signals";
import { browser } from "webextension-polyfill-ts";
import SiteStatusIndicator from "../components/site-status-indicator";

const statsStartDate = signal(new Date());
const totalCalls = signal(0);
browser.storage.local.get(["totalCalls", "statsStartDate"]).then((data) => {
  batch(() => {
    totalCalls.value = data.totalCalls || 0;
    statsStartDate.value = new Date(data.statsStartDate || Date.now());
  });
});
browser.storage.onChanged.addListener((changes) => {
  if (changes.totalCalls) {
    totalCalls.value = changes.totalCalls.newValue;
  }
});

function openOptions() {
  browser.runtime.openOptionsPage();
}

const PopupPage: FunctionComponent = () => {
  const numCallsString = useComputed(
    () => `${totalCalls.value} call${totalCalls.value === 1 ? "" : "s"}`
  );
  const startDate = useComputed(() =>
    statsStartDate.value.toLocaleDateString([], { dateStyle: "long" } as any)
  );
  const encouragement = useComputed(() => {
    if (totalCalls.value === 0) {
      return "Login to a phonebank to start calling!";
    } else if (totalCalls.value < 10) {
      return "Keep it up!";
    } else if (totalCalls.value < 100) {
      return "You're doing great!";
    } else if (totalCalls.value < 1000) {
      return "Keep up the amazing work!";
    } else {
      return "Wow. You're incredible. Keep it up!";
    }
  });

  return (
    <div>
      <nav class="navbar navbar-light bg-light">
        <a href="https://turbovpb.com" target="_blank" class="navbar-brand">
          <TurboVpbIcon />
          &nbsp; TurboVPB
        </a>

        <div class="ml-auto">
          <div class="row">
            <div class="col pr-1">
              <a
                href="https://chrome.google.com/webstore/detail/turbovpb/deekoplmjnhcnbkpojidakdbllmdhekh"
                id="webStoreLink"
                class="text-secondary text-center"
                target="_blank"
                title="Finding TurboVPB useful? Please leave a review!"
              >
                <div class="miniIcon">
                  <StarIcon />
                </div>
              </a>
            </div>
            <div class="col px-1">
              <a
                href="mailto:evan@turbovpb.com?subject=Feedback%20on%20TurboVPB"
                class="text-secondary text-center"
                target="_blank"
                title="Have feedback? Ideas and suggestions welcome!"
              >
                <div class="miniIcon">
                  <LightBulbIcon />
                </div>
              </a>
            </div>
            <div class="col pl-1">
              <a
                href="mailto:evan@turbovpb.com?subject=TurboVPB%20Help&body=Please%20describe%20in%20as%20much%20detail%20as%20you%20can%20what%20you%20were%20doing%20and%20what%20didn't%20work%20or%20didn't%20make%20sense."
                target="_blank"
                class="text-secondary text-center"
                title="Need help? Email me"
              >
                <div class="miniIcon">
                  <LifebuoyIcon />
                </div>
              </a>
            </div>
          </div>
        </div>
      </nav>
      <div class="container-md text-center p-4 rounded-lg">
        <div class="row">
          <div class="col">
            <small class="text-muted">You have made</small>
            <h4 class="pb-0 display-4">{numCallsString}</h4>
            <small class="text-muted">with TurboVPB since {startDate}</small>
            <p>
              <small class="text-muted">{encouragement}</small>
            </p>
          </div>
        </div>
        <div class="row mt-4">
          <div class="col">
            <SiteStatusIndicator />
          </div>
          <div class="col">
            <a class="text-muted">
              <div class="buttonIcon">
                <QrCodeIcon />
              </div>
              <small>
                Show <br />
                QR Code
              </small>
            </a>
          </div>
          <div class="col">
            <a
              class="text-dark"
              href="#"
              title="Enable 2-click texting in the settings"
              onClick={openOptions}
            >
              <div class="buttonIcon">
                <ChatBubbleLeftRightIcon />
              </div>
              <small>2-Click Texting</small>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PopupPage;
