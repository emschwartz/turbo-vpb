import { h, FunctionComponent } from "preact";
import TurboVpbIcon from "../../components/turbovpb-icon";
import {
  StarIcon,
  LightBulbIcon,
  LifebuoyIcon,
} from "@heroicons/react/24/outline";
import { ChatBubbleLeftRightIcon, QrCodeIcon } from "@heroicons/react/24/solid";
import { batch, signal, computed } from "@preact/signals";
import { browser } from "webextension-polyfill-ts";
import SiteStatusIndicator from "./site-status-indicator";
// import "../../index.css";

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
const numCallsString = computed(
  () => `${totalCalls.value} call${totalCalls.value === 1 ? "" : "s"}`
);
const startDate = computed(() =>
  statsStartDate.value.toLocaleDateString([], { dateStyle: "long" } as any)
);
const encouragement = computed(() => {
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

function openOptions() {
  browser.runtime.openOptionsPage();
}

const LeaveReviewButton: FunctionComponent = () => (
  <a
    href="https://chrome.google.com/webstore/detail/turbovpb/deekoplmjnhcnbkpojidakdbllmdhekh"
    id="webStoreLink"
    class="text-secondary text-center"
    target="_blank"
    title="Finding TurboVPB useful? Please leave a review!"
  >
    <StarIcon class="w-5" />
  </a>
);

const FeedbackButton: FunctionComponent = () => (
  <a
    href="mailto:evan@turbovpb.com?subject=Feedback%20on%20TurboVPB"
    class="text-secondary text-center"
    target="_blank"
    title="Have feedback? Ideas and suggestions welcome!"
  >
    <LightBulbIcon class="w-5" />
  </a>
);

const HelpButton: FunctionComponent = () => (
  <a
    href="mailto:evan@turbovpb.com?subject=TurboVPB%20Help&body=Please%20describe%20in%20as%20much%20detail%20as%20you%20can%20what%20you%20were%20doing%20and%20what%20didn't%20work%20or%20didn't%20make%20sense."
    target="_blank"
    class="text-secondary text-center"
    title="Need help? Email me"
  >
    <LifebuoyIcon class="w-6" />
  </a>
);

const NavBar: FunctionComponent = () => (
  <nav class="flex flex-row items-center p-3 bg-slate-100">
    <a
      href="https://turbovpb.com"
      target="_blank"
      class="flex flex-row items-center space-x-2"
    >
      <TurboVpbIcon class="w-4" />
      <div class="text-xl">TurboVPB</div>
    </a>

    <div class="flex-grow"></div>

    <HelpButton />
  </nav>
);

const CallStats: FunctionComponent = () => (
  <div class="text-center text-lg pb-4">
    <small class="text-muted">You have made</small>
    <h4 class="text-4xl">{numCallsString}</h4>
    <small class="text-muted">with TurboVPB since {startDate}</small>
    <p>
      <small class="text-muted">{encouragement}</small>
    </p>
  </div>
);

const Buttons: FunctionComponent = () => (
  <div class="inline-grid gap-4 grid-cols-3">
    <SiteStatusIndicator class="w-20" />
    <a class="text-muted flex flex-col items-center">
      <QrCodeIcon class="w-20" />
      <div>Show QR Code</div>
    </a>
    <a
      class="flex flex-col items-center"
      href="#"
      title="Enable 2-click texting in the settings"
      onClick={openOptions}
    >
      <ChatBubbleLeftRightIcon class="w-20" />
      <div>2-Click Texting</div>
    </a>
  </div>
);

const LeaveReview: FunctionComponent = () => (
  <a
    class="italic text-center text-sm"
    href="https://chrome.google.com/webstore/detail/turbovpb/deekoplmjnhcnbkpojidakdbllmdhekh"
    target="_blank"
  >
    Finding TurboVPB useful? Please leave a review!
  </a>
);

const PopupPage: FunctionComponent = () => {
  return (
    <div class="container">
      <NavBar />
      <div class="p-6 flex flex-col space-y-3">
        <CallStats />
        <Buttons />
        <LeaveReview />
      </div>
    </div>
  );
};

export default PopupPage;
