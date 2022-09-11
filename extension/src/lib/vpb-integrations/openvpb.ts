import { ContactDetails } from "../types";

const DESIGNATED_CONTACT_REGEX = /designated[ _-]?contact/i;

export const type = "openvpb";

export const turboVpbContainerLocation = () =>
  document.getElementById("openvpbsidebarcontainer");

export function scrapeContactDetails(): ContactDetails {
  const phoneNumber = (
    document.getElementById("openVpbPhoneLink") ||
    document.getElementById("openvpbphonelink") ||
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

export function scrapeResultCodes(): string[] | undefined {
  const button = couldntReachButton();
  if (!button) {
    return;
  }
  button.click();

  const elements = document.querySelectorAll(
    "input[name='script-contact-result']"
  );
  return Array.from(elements)
    .map((element) => (element as HTMLInputElement).labels[0].innerText)
    .filter((code) => !!code);
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

function couldntReachButton() {
  return (
    document.getElementById("displaycontactresultsbutton") ||
    document.getElementById("displayContactResultsButton")
  );
}

function saveNextButton() {
  return (
    document.getElementById("openvpbsavenextbutton") ||
    document.getElementById("openVpbSaveNextButton") ||
    document.getElementById("contactresultssavenextbutton") ||
    document.getElementById("contactResultsSaveNextButton")
  );
}
