import { ContactDetails } from "../types";

const DESIGNATED_CONTACT_REGEX = /designated[ _-]?contact/i;

export const type = "openvpb";

export function turboVpbContainerLocation() {
  const container = document.getElementById("openvpbsidebarcontainer");
  if (!container) {
    return;
  }
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
        !DESIGNATED_CONTACT_REGEX.test(a.parentElement.parentElement.id),
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
export async function scrapeResultCodes(): Promise<string[] | undefined> {
  const resultCodes = Object.keys(await getResultCodes());
  cancelButton()?.click();
  return resultCodes;
}

export async function markResult(resultCode: string) {
  const resultCodes = await getResultCodes();
  const li = resultCodes[resultCode];
  const input = li.querySelector("input[type='radio']") as HTMLInputElement;
  input.click();
  await sleep();
  saveNextButton()?.click();
}

export function onCallResult(
  callback: (contacted: boolean, result?: string) => void | Promise<void>,
) {
  // Determine which call result is selected
  const handler = () => {
    const selectedRadioButton = document.querySelector(
      ".contact-results input[type=radio]:checked",
    );
    const resultCode = (
      selectedRadioButton as HTMLInputElement
    )?.labels[0].textContent.trim();
    if (resultCode) {
      callback(false, resultCode);
    } else {
      callback(true);
    }
  };
  // When the Couldn't Reach button is clicked, add the event listener
  // to the separate save result button that appears
  const setupContactResultsButton = async () => {
    await sleep();
    const buttons = [
      document.getElementById("contactresultssavenextbutton"),
      document.getElementById("contactresultstryalternatephone"),
    ];
    for (const button of buttons) {
      setupButton(handler, button);
    }
    // If the call result is unselected again, the other buttons will
    // be re-rendered so we need to set the whole thing up again
    cancelButton()?.addEventListener("click", async () => {
      await sleep();
      onCallResult(callback);
    });
  };
  // Add an event listener and add a marker class so we don't accidentally
  // add multiple event listeners
  // (this is somewhat confusing because various elements on the page are
  // removed and re-rendered at various points)
  const setupButton = (handler: () => void, button?: HTMLElement) => {
    const markerClass = "turbovpb-click-handler";

    if (button && !button.classList.contains(markerClass)) {
      button.classList.add(markerClass);
      button.addEventListener("click", handler);
    }
  };

  // This button is always visiable
  setupButton(handler, document.getElementById("openvpbsavenextbutton"));

  // Wait for the Couldn't Reach button to be pressed to set up the other listeners
  setupButton(setupContactResultsButton, couldntReachButton());
}

async function getResultCodes(): Promise<{ [key: string]: HTMLElement }> {
  couldntReachButton()?.click();

  await sleep();

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

async function sleep() {
  await new Promise((resolve) => setTimeout(resolve, 10));
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
