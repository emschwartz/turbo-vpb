import { FunctionComponent } from "preact";
import {
  StarIcon,
  QuestionMarkCircleIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { batch, signal, computed } from "@preact/signals";
import browser from "webextension-polyfill";
import { DailyCallHistory } from "../../lib/types";
import TurboVpbLogoAndName from "../../components/turbovpb-logo-and-name";
import SiteStatusIndicator from "./site-status-indicator";
import WhiteButton from "./white-button";

const statsStartDate = signal(new Date());
const totalCalls = signal(0);
const dailyCalls = signal([] as DailyCallHistory);
browser.storage.local
  .get(["totalCalls", "statsStartDate", "dailyCalls"])
  .then((data) => {
    batch(() => {
      totalCalls.value = data.totalCalls || 0;
      statsStartDate.value = new Date(data.statsStartDate || Date.now());
      dailyCalls.value = data.dailyCalls || [];
    });
  });
browser.storage.onChanged.addListener((changes) => {
  if (changes.totalCalls) {
    totalCalls.value = changes.totalCalls.newValue;
  }
  if (changes.dailyCalls) {
    dailyCalls.value = changes.dailyCalls.newValue;
  }
});
const startDate = computed(() =>
  statsStartDate.value.toLocaleDateString([], { dateStyle: "medium" } as any)
);
const callsToday = computed(() => {
  const todaysRecord = dailyCalls.value[dailyCalls.value.length - 1];
  const date = new Date().toLocaleDateString();
  return todaysRecord && todaysRecord[0] === date ? todaysRecord[1] : 0;
});

function openOptions() {
  browser.runtime.openOptionsPage();
  window.close();
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
    <TurboVpbLogoAndName />

    <div class="flex-grow"></div>

    <div class="flex flex-row space-x-1">
      <LeaveReviewButton />
      <HelpButton />
    </div>
  </nav>
);

const CallStats: FunctionComponent = () => (
  <div>
    <dl class="grid grid-cols-1 gap-3">
      <div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow">
        <dt class="truncate text-sm font-medium text-gray-500">
          Calls Since {startDate}
        </dt>
        <dd class="mt-1 text-3xl font-semibold tracking-light text-gray-900">
          {totalCalls.value}
        </dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow">
        <dt class="truncate text-sm font-medium text-gray-500">Calls Today</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-light text-gray-900">
          {callsToday.value}
        </dd>
      </div>
    </dl>
  </div>
);

const PopupPage: FunctionComponent = () => {
  return (
    <div class="container">
      <NavBar />
      <div class="p-6 flex flex-col space-y-3">
        <CallStats />
        <SiteStatusIndicator />
        <WhiteButton
          text="2-Click Texting"
          title="Open extension settings to configure 2-Click Texting"
          icon={<ChatBubbleLeftRightIcon />}
          onClick={openOptions}
        />
      </div>
    </div>
  );
};

export default PopupPage;
