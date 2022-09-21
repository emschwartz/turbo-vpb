import { ContactDetails } from "../types";

const DESIGNATED_CONTACT_REGEX = /designated[ _-]?contact/i;

export const type = "openvpb";

export const turboVpbContainerLocation = () =>
  document.getElementById("openvpbsidebarcontainer");

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
  const button = couldntReachButton();
  if (!button) {
    return;
  }
  button.click();

  const elements = document.querySelectorAll(
    "input[name='script-contact-result']"
  );
  const resultCodes = Array.from(elements)
    .map((element) => (element as HTMLInputElement).labels[0].innerText)
    .filter((code) => !!code);

  cancelButton()?.click();

  return resultCodes;
}

export function markResult(result: string) {
  const resultCode = result.toLowerCase();
  try {
    couldntReachButton().click();
    for (let radioUnit of document.querySelectorAll("li.radio-unit")) {
      if (
        resultCode ===
        radioUnit.querySelector(".radio-label").textContent.toLowerCase()
      ) {
        (
          radioUnit.querySelector('input[type="radio"]') as HTMLInputElement
        ).click();
        setTimeout(() => saveNextButton().click(), 1);
        return;
      }
    }
    console.warn("Result code not found:", result);
  } catch (err) {
    console.error(err);
  }
}

export function onCallResult(
  callback: (contacted: boolean, result?: string) => void | Promise<void>
) {
  let result: string | null = null;

  // Listen for when the result code radio buttons are selected
  // (but note that the user might click more than one)
  for (const radioUnit of document.querySelectorAll("li.radio-unit")) {
    const resultCode = radioUnit.querySelector(".radio-label").textContent;
    radioUnit?.addEventListener("click", () => (result = resultCode));
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
