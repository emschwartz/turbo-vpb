import { FunctionComponent } from "preact";
import {
  StarIcon,
  QuestionMarkCircleIcon,
  ChatBubbleLeftRightIcon,
} from "../../components/icons";
import { batch, signal, computed } from "@preact/signals";
import { browser } from "wxt/browser";
import { DailyCallHistory } from "../../lib/types";
import TurboVpbLogoAndName from "../../components/turbovpb-logo-and-name";
import SiteStatusIndicator from "./site-status-indicator";
import WhiteButton from "./white-button";
import "../../assets/main.css";

const statsStartDate = signal(new Date());
const totalCalls = signal(0);
const dailyCalls = signal([] as DailyCallHistory);
browser.storage.local
  .get(["totalCalls", "statsStartDate", "dailyCalls"])
  .then((data) => {
    batch(() => {
      totalCalls.value = (data.totalCalls as number) || 0;
      statsStartDate.value = new Date(
        (data.statsStartDate as number) || Date.now(),
      );
      dailyCalls.value = (data.dailyCalls as DailyCallHistory) || [];
    });
  });
browser.storage.onChanged.addListener((changes) => {
  if (changes.totalCalls) {
    totalCalls.value = changes.totalCalls.newValue as number;
  }
  if (changes.dailyCalls) {
    dailyCalls.value = changes.dailyCalls.newValue as DailyCallHistory;
  }
});
const startDate = computed(() =>
  statsStartDate.value.toLocaleDateString([], { dateStyle: "medium" } as any),
);
const callsToday = computed(() => {
  const todaysRecord = dailyCalls.value[dailyCalls.value.length - 1];
  const date = new Date().toISOString().slice(0, 10);
  return todaysRecord && todaysRecord[0] === date ? todaysRecord[1] : 0;
});

function openOptions() {
  browser.runtime.openOptionsPage();
  window.close();
}

function getStoreUrl(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) {
    return "https://addons.mozilla.org/en-US/firefox/addon/turbovpb/";
  }
  return "https://chrome.google.com/webstore/detail/turbovpb/deekoplmjnhcnbkpojidakdbllmdhekh";
}

const LeaveReviewButton: FunctionComponent = () => (
  <a
    href={getStoreUrl()}
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
    href="https://github.com/emschwartz/turbo-vpb/issues"
    target="_blank"
    class="text-slate-700"
    title="Report issues or ask questions on GitHub"
  >
    <QuestionMarkCircleIcon class="w-5" />
  </a>
);

const NavBar: FunctionComponent = () => (
  <nav class="flex flex-row items-center p-3 bg-white border-b border-slate-200">
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
      <div class="overflow-hidden rounded-lg bg-slate-50 px-4 py-5 border border-slate-200">
        <dt class="truncate text-sm font-medium text-slate-500">
          Calls Since {startDate}
        </dt>
        <dd class="mt-1 text-3xl font-semibold tracking-light text-slate-900">
          {totalCalls.value}
        </dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-slate-50 px-4 py-5 border border-slate-200">
        <dt class="truncate text-sm font-medium text-slate-500">Calls Today</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-light text-slate-900">
          {callsToday.value}
        </dd>
      </div>
    </dl>
  </div>
);

const PopupPage: FunctionComponent = () => {
  return (
    <div class="container w-64">
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
