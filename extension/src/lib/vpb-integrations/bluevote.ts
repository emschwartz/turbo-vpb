import { ContactDetails } from "../types";

export const type = "bluevote";

export function turboVpbContainerLocation() {
  const container = document.querySelector(".caller-info");
  const div = document.createElement("div");
  container.append(div);
  return div;
}

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

export async function scrapeResultCodes(): Promise<string[] | undefined> {
  const elements = nonContactRadioButtons();
  if (elements.length === 0) {
    console.error("Could not find Result Codes");
    return;
  }
  return elements.map((e) => e.value);
}

export async function markResult(result: string) {
  let resultCode = result.toLowerCase();
  if (resultCode !== "texted") {
    resultCode = "not home";
  }
  try {
    for (let radioUnit of nonContactRadioButtons()) {
      if (radioUnit.parentNode.textContent.toLowerCase() === resultCode) {
        radioUnit.click();
        await sleep();
        saveNextButton().click();
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

async function sleep() {
  await new Promise((resolve) => setTimeout(resolve, 10));
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
