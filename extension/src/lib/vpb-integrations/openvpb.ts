import { ContactDetails } from "../types";

const DESIGNATED_CONTACT_REGEX = /designated[ _-]?contact/i;

export const type = "openvpb";

export function turboVpbContainerLocation() {
  const container = document.getElementById("openvpbsidebarcontainer");
  const div = document.createElement("div");
  container.append(div);
  return div;
}

export function scrapeContactDetails(): ContactDetails {
  dismissFirstCallPopup();

  const phoneNumber = (
    document.getElementById("openVpbPhoneLink") ||
    document.getElementById("openvpbphonelink") ||
    document.getElementById("openvpb-phone-link-current") ||
    Array.from(document.getElementsByTagName("a")).find(
      (a) =>
        a.href.startsWith("tel:") &&
        !DESIGNATED_CONTACT_REGEX.test(a.parentElement.id) &&
        !DESIGNATED_CONTACT_REGEX.test(a.parentElement.parentElement.id)
    ) ||
    {}
  ).innerText;

  const name = document.getElementById("contactName")?.innerText;
  const firstName = name?.split(" ")[0];
  const lastName = name?.split(" ").slice(1).join(" ");

  const additionalFields = {};
  const detailsSidebar =
    document.getElementById("openvpb-target-details") ||
    document.querySelector(".openvpb-sidebar-fields");
  if (detailsSidebar && detailsSidebar.querySelector("dl")) {
    const dl = detailsSidebar.querySelector("dl");
    const pairs = dl.querySelectorAll("dt, dd");
    let key: string;
    for (let i = 0; i < pairs.length; i++) {
      if (!key && pairs[i].tagName === "DT") {
        key = pairs[i].textContent;
      } else if (key && pairs[i].tagName === "DD") {
        additionalFields[key] = pairs[i].textContent;
        key = null;
      }
    }
  }

  if (phoneNumber && firstName) {
    return { phoneNumber, firstName, lastName, additionalFields };
  }
}

// The result codes are in the following format:
/*
<ul class="radio-list contact-results">
  <li class="radio-unit">
    <input
      id="result-1"
      class="radio"
      name="script-contact-result"
      type="radio"
      aria-labelledby="result-1-label"
      value="1"
    />

    <label id="result-1-label" class="radio-label" for="result-1">
      Not Home
    </label>
  </li>
</ul>
*/
export function scrapeResultCodes(): string[] | undefined {
  const resultCodes = Object.keys(getResultCodes());
  cancelButton()?.click();
  return resultCodes;
}

function getResultCodes(): { [key: string]: HTMLElement } {
  couldntReachButton()?.click();

  const elements = document.querySelectorAll(".contact-results li");
  const resultCodes = {};
  for (const element of elements) {
    const resultCode = element.textContent.trim();
    if (resultCode) {
      resultCodes[resultCode] = element;
    }
  }
  return resultCodes;
}

export function markResult(resultCode: string) {
  const li = getResultCodes()[resultCode];
  const input = li.querySelector("input[type='radio']") as HTMLInputElement;
  input.click();
  setTimeout(() => saveNextButton().click(), 1);
}

export function onCallResult(
  callback: (contacted: boolean, result?: string) => void | Promise<void>
) {
  let result: string | null = null;

  // Listen for when the result code radio buttons are selected
  // (but note that the user might click more than one)
  const resultCodes = getResultCodes();
  for (const resultCode in resultCodes) {
    resultCodes[resultCode].addEventListener(
      "click",
      () => (result = resultCode)
    );
  }

  cancelButton()?.addEventListener("click", () => (result = null));

  saveNextButton()?.addEventListener("click", () => callback(!result, result));
}

function couldntReachButton() {
  return (
    document.getElementById("displaycontactresultsbutton") ||
    document.getElementById("displayContactResultsButton")
  );
}

function cancelButton() {
  return (
    document.getElementById("contactresultscancelbutton") ||
    document.getElementById("contactResultsCancelButton")
  );
}

function saveNextButton() {
  return (
    document.getElementById("contactresultssavenextbutton") ||
    document.getElementById("contactResultsSaveNextButton") ||
    document.getElementById("openvpbsavenextbutton") ||
    document.getElementById("openVpbSaveNextButton") ||
    document.getElementById("contactresultstryalternatephone")
  );
}

function dismissFirstCallPopup() {
  const nextCall = document.getElementById("firstcallmodalnextcallbutton");
  nextCall?.click();
}
