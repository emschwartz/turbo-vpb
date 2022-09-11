import { ContactDetails } from "../types";

const DESIGNATED_CONTACT_REGEX = /designated[ _-]?contact/i;

export const type = "everyaction";

export const turboVpbContainerLocation = () =>
  document.getElementsByClassName("grid-half")[0];

export function scrapeContactDetails(): ContactDetails {
  const phoneNumber = (
    (document.getElementById("current-number") &&
      document.getElementById("current-number").firstElementChild) ||
    Array.from(document.getElementsByTagName("a")).find(
      (a) =>
        a.href.startsWith("tel:") &&
        !DESIGNATED_CONTACT_REGEX.test(a.parentElement.id) &&
        !DESIGNATED_CONTACT_REGEX.test(a.parentElement.parentElement.id)
    ) ||
    {}
  ).textContent;

  const name =
    (document.querySelector(".person-phone-panel") &&
      document
        .querySelector(".person-phone-panel")
        .firstElementChild.textContent.replace(/ [–-] \d+(?:\s+\w)?/, "")) ||
    null;
  const firstName = name?.split(" ")[0];
  const lastName = name?.split(" ").slice(1).join(" ");

  const additionalFields = {};
  if (document.getElementById("spanTableAdditionalInfo")) {
    for (const inputUnit of document
      .getElementById("spanTableAdditionalInfo")
      .querySelectorAll(".input-unit")
      .values()) {
      const label = inputUnit.querySelector("label, .input-label");
      const value = inputUnit.querySelector(".form-control, div");
      if (label && value) {
        additionalFields[label.textContent] = value.textContent;
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

  const elements = Array.from(document.getElementsByClassName("script-result"));
  return elements.map((element) => element.textContent);
}

export function markResult(result: string) {
  const resultCode = result.toLowerCase();
  try {
    couldntReachButton().click();
    const textedResult = Array.from(
      document.querySelectorAll('input[name="resultCodeId"]')
    ).filter(
      (node) => node.parentNode.textContent.toLowerCase() === resultCode
    )[0];
    if (textedResult) {
      (textedResult as HTMLInputElement).click();
      setTimeout(() => saveNextButton().click(), 1);
    } else {
      console.warn("Result code not found:", result);
    }
  } catch (err) {
    console.error(err);
  }
}

function couldntReachButton() {
  return (
    document.getElementById("switch") ||
    document.querySelector("button.btn.btn-warning")
  );
}

function saveNextButton() {
  return (
    document.getElementById(
      "ctl00_ContentPlaceHolderVANPage_scriptSectionbtnSaveNextHH"
    ) || document.querySelector('input.btn[type="submit"]')
  );
}
