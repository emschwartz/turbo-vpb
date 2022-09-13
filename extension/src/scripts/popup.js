import "../scss/main.scss";
import browser from "webextension-polyfill/dist/browser-polyfill";

const OPENVPB_REGEX = /https\:\/\/(www\.)?openvpb\.com/i;
const EVERYACTION_REGEX = /https\:\/\/.*\.(everyaction|ngpvan)\.com/i;
const VOTEBUILDER_REGEX = /https\:\/\/(www\.)?votebuilder.com/i;
const BLUEVOTE_REGEX = /https\:\/\/.*\.bluevote.com/i;
const STARTTHEVAN_REGEX = /https\:\/\/(www\.)?startthevan.com/i;
const LOCALHOST_REGEX = /https?\:\/\/localhost/i;

const OPENVPB_ORIGIN = "https://www.openvpb.com/VirtualPhoneBank*";
const EVERYACTION_ORIGIN = "https://*.everyaction.com/ContactDetailScript*";
const VOTEBUILDER_ORIGIN = "https://www.votebuilder.com/ContactDetailScript*";
const BLUEVOTE_ORIGIN = "https://phonebank.bluevote.com/*";
const STARTTHEVAN_ORIGIN = "https://www.startthevan.com/ContactDetailScript*";
const LOCALHOST_ORIGIN = "http://localhost/*";

let canEnable = false;
let isEnabled = false;
let shouldShowQrCode = false;
let siteName;
let origin;
let activeTabId;
let firstRender = true;

onOpen().catch(console.error);
document.getElementById("toggleOnSite").addEventListener("click", toggleOnSite);
document.getElementById("openOptions").addEventListener("click", async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});
document
  .getElementById("toggleOnSite")
  .addEventListener("mouseenter", hoverToggleSite);
document
  .getElementById("toggleOnSite")
  .addEventListener("mouseleave", resetStatusLook);
document.getElementById("showQrCode").addEventListener("click", showQrCode);
if (/firefox/i.test(navigator.userAgent)) {
  document
    .getElementById("webStoreLink")
    .setAttribute(
      "href",
      "https://addons.mozilla.org/en-US/firefox/addon/turbovpb/"
    );
}

async function onOpen() {
  console.log("popup opened");
  const [{ statsStartDate, totalCalls = "0" }, [activeTab], permissions] =
    await Promise.all([
      browser.storage.local.get(["statsStartDate", "totalCalls"]),
      browser.tabs.query({
        active: true,
        currentWindow: true,
      }),
      browser.permissions.getAll(),
    ]);
  browser.storage.onChanged.addListener((changes) => {
    if (changes.totalCalls) {
      showTotalCalls(changes.totalCalls.newValue);
    }
  });

  // Display stats
  if (statsStartDate) {
    const date = new Date(statsStartDate);
    document.getElementById("statsStartDate").innerText = `${
      date.getMonth() + 1
    }/${date.getDate()}`;
  }

  showTotalCalls(totalCalls);

  if (activeTab) {
    activeTabId = activeTab.id;
    console.log("Active tab ID:", activeTabId);

    if (activeTab.url) {
      console.log("Current tab URL:", activeTab.url);

      if (OPENVPB_REGEX.test(activeTab.url)) {
        canEnable = true;
        siteName = "OpenVPB";
        origin = OPENVPB_ORIGIN;
        isEnabled = permissions.origins.some((o) => OPENVPB_REGEX.test(o));
        shouldShowQrCode = /VirtualPhoneBank\/.+/i.test(activeTab.url);
      } else if (VOTEBUILDER_REGEX.test(activeTab.url)) {
        canEnable = true;
        siteName = "VoteBuilder";
        origin = VOTEBUILDER_ORIGIN;
        isEnabled = permissions.origins.some((o) => VOTEBUILDER_REGEX.test(o));
        shouldShowQrCode = /ContactDetailScript/i.test(activeTab.url);
      } else if (BLUEVOTE_REGEX.test(activeTab.url)) {
        canEnable = true;
        siteName = "BlueVote";
        origin = BLUEVOTE_ORIGIN;
        isEnabled = permissions.origins.some((o) => BLUEVOTE_REGEX.test(o));
        shouldShowQrCode = true;
      } else if (EVERYACTION_REGEX.test(activeTab.url)) {
        // TODO request permission for specific subdomain
        canEnable = true;
        siteName = "VAN";
        origin = EVERYACTION_ORIGIN;
        isEnabled = permissions.origins.some((o) => EVERYACTION_REGEX.test(o));
        shouldShowQrCode = /ContactDetailScript/i.test(activeTab.url);
      } else if (STARTTHEVAN_REGEX.test(activeTab.url)) {
        canEnable = true;
        siteName = "StartTheVAN";
        origin = STARTTHEVAN_ORIGIN;
        isEnabled = permissions.origins.some((o) => STARTTHEVAN_REGEX.test(o));
        shouldShowQrCode = /ContactDetailScript/i.test(activeTab.url);
      } else if (await siteIsVanWithCustomDomain(activeTabId)) {
        canEnable = true;
        siteName = "This Site";
        const url = new URL(activeTab.url);
        origin = `${url.protocol}//${url.host}/ContactDetailScript*`;
        isEnabled = permissions.origins.includes(origin);
        shouldShowQrCode = /ContactDetailScript/i.test(activeTab.url);
      } else if (LOCALHOST_REGEX.test(activeTab.url)) {
        canEnable = true;
        siteName = "Test Phonebank";
        origin = LOCALHOST_ORIGIN;
        isEnabled = permissions.origins.includes(origin);
        shouldShowQrCode = true;
      }
    }
  }

  if (isEnabled) {
    document.getElementById("toggleOnSite").setAttribute("href", "#");
    document
      .getElementById("toggleOnSite")
      .classList.replace("text-muted", "text-dark");
  } else if (canEnable) {
    document.getElementById("toggleOnSite").setAttribute("href", "#");
    document
      .getElementById("toggleOnSite")
      .classList.replace("text-muted", "text-dark");
  }
  resetStatusLook();
}
