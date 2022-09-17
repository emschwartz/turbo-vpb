import { ContactDetails, PhonebankType } from "../types";
import * as openvpb from "./openvpb";
import * as everyaction from "./everyaction";
import * as bluevote from "./bluevote";
import { browser } from "webextension-polyfill-ts";

interface VpbIntegration {
  type: PhonebankType;
  scrapeContactDetails: () => ContactDetails | undefined;
  scrapeResultCodes: () => string[] | undefined;
  markResult(code: string): void;
  turboVpbContainerLocation(): Element;
  onCallResult(
    callback: (contacted: boolean, result?: string) => void | Promise<void>
  ): void;
}

const integrations: { [Property in PhonebankType]: VpbIntegration } = {
  openvpb: openvpb,
  everyaction: everyaction,
  bluevote: bluevote,
};

/**
 * Try to determine the phonebank type based on the current URL
 */
export function selectPhonebankType(
  currentUrl = window.location.href
): PhonebankType | undefined {
  const url = new URL(currentUrl);
  if (
    url.hostname === "openvpb.com" ||
    // The test phonebank uses the same style as OpenVPB
    (url.hostname.endsWith("turbovpb.com") &&
      url.pathname.startsWith("/test-phonebank")) ||
    // Only for testing
    url.toString().startsWith("http://localhost:8080/test-phonebank")
  ) {
    return "openvpb";
  } else if (url.hostname === "phonebank.bluevote.com") {
    return "bluevote";
  } else if (
    url.hostname.endsWith("everyaction.com") ||
    url.hostname === "votebuilder.com"
  ) {
    return "everyaction";
  } else {
    return;
  }
}

/**
 * Automatically returns the correct integration based on the current URL
 */
export function selectIntegration(url = window.location.href): VpbIntegration {
  const type = selectPhonebankType(url);
  console.log(`Using ${type} integration`);
  return integrations[type || "everyaction"];
}

/**
 * Check if the given tab is an EveryAction / VAN phonebank
 */
export async function isVanWithCustomDomain(tabId: number): Promise<boolean> {
  try {
    const result = await browser.tabs.executeScript(tabId, {
      code: `(document.querySelector(".van-header") || document.querySelector(".van-inner")) !== null`,
    });
    console.log("isVanWithCustomDomain result", result);
    return Array.isArray(result) && result[0] === true;
  } catch (err) {
    throw new Error(`Error checking if tab is VAN with custom domain: ${err}`);
  }
}

export default integrations;
