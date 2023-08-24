import { ContactDetails } from "../types";

const DESIGNATED_CONTACT_REGEX = /designated[ _-]?contact/i;

export const type = "everyaction";

export function turboVpbContainerLocation() {
  const grid = document.getElementsByClassName("grid-half")[0];
  if (!grid) {
    return;
  }
  const div = document.createElement("div");
  div.className =
    "col-lg-6 col-md-6 col-sm-12 margin-right-tiny panel panel-details panel-default";
  grid.append(div);
  return div;
}

export function scrapeContactDetails(): ContactDetails {
  const phoneNumber = (
    (document.getElementById("current-number") &&
      document.getElementById("current-number").firstElementChild) ||
    Array.from(document.getElementsByTagName("a")).find(
      (a) =>
        a.href.startsWith("tel:") &&
        !DESIGNATED_CONTACT_REGEX.test(a.parentElement.id) &&
        !DESIGNATED_CONTACT_REGEX.test(a.parentElement.parentElement.id),
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

export async function scrapeResultCodes(): Promise<string[] | undefined> {
  const resultCodes = Object.keys(await getResultCodes());
  cancelButton()?.click();
  return resultCodes;
}

export async function markResult(resultCode: string) {
  const resultCodes = await getResultCodes();
  const element = resultCodes[resultCode];
  if (element) {
    const input = element.querySelector(
      "input[type='radio']",
    ) as HTMLInputElement;
    input.click();
    console.log("Marked result:", resultCode);
    await sleep();
    saveNextButton().click();
  } else {
    console.warn("Result code not found:", resultCode, resultCodes);
  }
}

async function getResultCodes(): Promise<{ [key: string]: HTMLElement }> {
  couldntReachButton()?.click();
  await sleep();

  const elements = Array.from(document.getElementsByClassName("script-result"));
  const results = {};

  for (const element of elements) {
    const resultCode = element.textContent.replace(/\s{2,}/g, " ").trim();
    results[resultCode] = element;
  }
  return results;
}

export function onCallResult(
  callback: (contacted: boolean, result?: string) => void | Promise<void>,
) {
  const markerClass = "turbovpb-click-handler";
  const saveNext = saveNextButton();
  if (saveNext && !saveNext.classList.contains(markerClass)) {
    saveNext.classList.add(markerClass);

    saveNextButton().addEventListener("click", () => {
      const selectedRadioButton = document.querySelector(
        ".script-result input[type=radio]:checked",
      );
      const callResult = selectedRadioButton?.parentNode.textContent
        .replace(/\s{2,}/g, " ")
        .trim();
      if (callResult) {
        callback(false, callResult);
      } else {
        callback(true);
      }
    });
  }
}

async function sleep() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function couldntReachButton() {
  return (
    document.getElementById("switch") ||
    document.querySelector("button.btn.btn-warning")
  );
}

function cancelButton() {
  return document.getElementById("cancel-has-made-contact");
}

function saveNextButton() {
  return (
    document.getElementById(
      "ctl00_ContentPlaceHolderVANPage_scriptSectionbtnSaveNextHH",
    ) || document.querySelector('input.btn[type="submit"]')
  );
}
