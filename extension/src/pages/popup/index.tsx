import { h, FunctionComponent, VNode } from "preact";
import TurboVpbIcon from "../../components/turbovpb-icon";
import {
  StarIcon,
  QuestionMarkCircleIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { QrCodeIcon } from "@heroicons/react/24/solid";
import { batch, signal, computed } from "@preact/signals";
import { browser } from "webextension-polyfill-ts";
import SiteStatusIndicator from "./site-status-indicator";

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
const startDate = computed(() =>
  statsStartDate.value.toLocaleDateString([], { dateStyle: "medium" } as any)
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

const HelpButton: FunctionComponent = () => (
  <a
    href="https://join.slack.com/t/turbophonebank/shared_invite/zt-1g3ounuk2-KxWo4negWzH_8W4T3A_Sbg"
    target="_blank"
    class="text-gray-700"
    title="Join us on Slack to ask questions or discuss TurboVPB"
  >
    <QuestionMarkCircleIcon class="w-5" />
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

    <div class="flex flex-row space-x-1">
      <LeaveReviewButton />
      <HelpButton />
    </div>
  </nav>
);

const CallStats: FunctionComponent = () => (
  <div>
    <dl>
      <div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow">
        <dt class="truncate text-sm font-medium text-gray-500">
          Calls Since {startDate}
        </dt>
        <dd class="mt-1 text-3xl font-semibold tracking-light text-gray-900">
          {totalCalls.value}
        </dd>
      </div>
    </dl>
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

const WhiteButton: FunctionComponent<{
  text: string;
  icon: VNode;
  onClick: () => void;
}> = ({ text, icon, onClick }) => (
  <button
    onClick={onClick}
    class="inline-flex items-center rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
  >
    <div class="-ml-1 mr-3 h-6 w-6">{icon}</div>
    {text}
  </button>
);

const PopupPage: FunctionComponent = () => {
  return (
    <div class="container">
      <NavBar />
      <div class="p-6 flex flex-col space-y-3">
        <CallStats />
        <WhiteButton
          text="Open QR Code"
          icon={<QrCodeIcon />}
          onClick={() => {}}
        />
        <WhiteButton
          text="2-Click Texting"
          icon={<ChatBubbleLeftRightIcon />}
          onClick={openOptions}
        />
      </div>
    </div>
  );
};

export default PopupPage;
