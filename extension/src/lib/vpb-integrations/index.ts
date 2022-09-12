import { ContactDetails, PhonebankType } from "../types";
import * as openvpb from "./openvpb";
import * as everyaction from "./everyaction";
import * as bluevote from "./bluevote";

interface VpbIntegration {
  type: PhonebankType;
  scrapeContactDetails: () => ContactDetails | undefined;
  scrapeResultCodes: () => string[] | undefined;
  markResult(code: string): void;
  turboVpbContainerLocation(): Element;
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
  url = new URL(window.location.href)
): PhonebankType {
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
  } else {
    // Assume all others are instances of EveryAction because they may be
    // hosted on custom domains
    return "everyaction";
  }
}

/**
 * Automatically returns the correct integration based on the current URL
 */
export function selectIntegration(
  url = new URL(window.location.href)
): VpbIntegration {
  const type = selectPhonebankType(url);
  console.log(`Using ${type} integration`);
  return integrations[type];
}

export default integrations;
