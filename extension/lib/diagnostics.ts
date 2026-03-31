import { ServerStatus, PeerStatus, ScrapingStatus } from "./types";

interface DiagnosticParams {
  serverStatus: ServerStatus;
  peerStatus: PeerStatus;
  scrapingStatus: ScrapingStatus;
  extensionVersion: string;
  userAgent: string;
}

export function buildDiagnosticClipboard(params: DiagnosticParams): string {
  const {
    serverStatus,
    peerStatus,
    scrapingStatus,
    extensionVersion,
    userAgent,
  } = params;

  const lines: string[] = [
    "--- TurboVPB Diagnostic Details ---",
    `Server status: ${formatServerStatus(serverStatus)}`,
    `Peer status: ${peerStatus.state}`,
    `Contact scraping: ${formatScrapingStatus(scrapingStatus)}`,
    `Extension version: ${extensionVersion}`,
    `Browser: ${userAgent}`,
  ];

  if (scrapingStatus.state === "not_found") {
    const { pageHints, platform } = scrapingStatus;
    lines.push("");
    lines.push(`Platform: ${platform}`);
    lines.push(`Page URL: ${pageHints.url}`);
    lines.push("");
    lines.push("--- Selectors Expected ---");
    lines.push(pageHints.selectorsExpected.join(", "));
    lines.push("");
    lines.push("--- Phone Numbers Found on Page ---");
    if (pageHints.phoneNumberLocations.length === 0) {
      lines.push("(none found)");
    } else {
      for (const loc of pageHints.phoneNumberLocations) {
        lines.push(`${loc.number} at ${loc.domPath}`);
      }
    }
    lines.push("");
    lines.push("--- Page Element IDs ---");
    lines.push(pageHints.elementIds.join(", "));
    lines.push("");
    lines.push("--- Body Classes ---");
    lines.push(pageHints.bodyClasses || "(none)");
    lines.push("");
    lines.push("--- HTML Structure (content area) ---");
    lines.push(pageHints.htmlStructure || "(empty)");
  }

  return lines.join("\n");
}

function formatScrapingStatus(status: ScrapingStatus): string {
  if (status.state === "found" && status.confidence === "low") {
    return "found (low confidence, using fallback)";
  }
  return status.state;
}

function formatServerStatus(status: ServerStatus): string {
  if (status.state === "error") {
    return `error (${status.error})`;
  }
  return status.state;
}

export function buildReportIssueMailto(): string {
  const subject = encodeURIComponent("TurboVPB Issue Report");
  const body = encodeURIComponent(
    `Hi Evan,

I ran into a problem while using TurboVPB.

Please paste the diagnostic details from your clipboard below (they were copied automatically when you clicked "Report issue"):

[PASTE HERE]

Please also describe what happened in as much detail as possible, including any other details that might help figure out what's wrong:

`,
  );
  return `mailto:evan@turbovpb.com?subject=${subject}&body=${body}`;
}
