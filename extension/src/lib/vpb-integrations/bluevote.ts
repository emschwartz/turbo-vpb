import { ContactDetails } from "../types";

export const type = "bluevote";

export const turboVpbContainerLocation = () =>
  document.querySelector(".caller-info");

export function scrapeContactDetails(): ContactDetails | undefined {
  const phoneNumber = (
    document.getElementById("main-phone") ||
    Array.from(document.getElementsByTagName("a")).find((a) =>
      a.href.startsWith("tel:")
    ) ||
    {}
  ).innerText;

  const name =
    document.getElementById("voter-name") &&
    document.getElementById("voter-name").innerText.replace(/\s\*/, "");
  const firstName = name?.split(" ")[0];
  const lastName = name?.split(" ").slice(1).join(" ");

  if (phoneNumber && firstName) {
    return { phoneNumber, firstName, lastName, additionalFields: {} };
  }
}

export function scrapeResultCodes(): string[] | undefined {
  const elements = nonContactRadioButtons();
  if (elements.length === 0) {
    console.error("Could not find Result Codes");
    return;
  }
  return elements.map((e) => e.value);
}

export function markResult(result: string) {
  let resultCode = result.toLowerCase();
  if (resultCode !== "texted") {
    resultCode = "not home";
  }
  try {
    for (let radioUnit of nonContactRadioButtons()) {
      if (radioUnit.parentNode.textContent.toLowerCase() === resultCode) {
        radioUnit.click();
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
  let result: string | undefined;

  // Listen for when the result code radio buttons are selected
  // (but note that the user might click more than one)
  for (const element of nonContactRadioButtons()) {
    const resultCode = element?.parentNode?.textContent;
    const button = element.querySelector(
      'input[name="resultCodeId"]'
    ) as HTMLInputElement;
    button?.addEventListener("click", () => (result = resultCode));
  }

  const cancelButton = document.querySelector(".clearNonContact");
  cancelButton?.addEventListener("click", () => (result = null));

  saveNextButton()?.addEventListener("click", () => callback(!result, result));
}

function nonContactRadioButtons(): HTMLInputElement[] {
  const nonContactResultContainer =
    document.querySelector(".non-contact-top") ||
    document.querySelector(".question.disposition");
  if (nonContactResultContainer) {
    return Array.from(
      nonContactResultContainer.querySelectorAll('input[type="radio"]')
    ) as HTMLInputElement[];
  } else {
    return [];
  }
}

function saveNextButton() {
  return (
    document.getElementById("btnSave") ||
    document.querySelector(
      'input[type="button"][value="Save Data / Next Call"]'
    )
  );
}
