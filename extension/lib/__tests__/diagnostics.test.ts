import { describe, it, expect } from "vitest";
import {
  buildDiagnosticClipboard,
  buildReportIssueMailto,
} from "../diagnostics";
import { ServerStatus, PeerStatus, ScrapingStatus } from "../types";

describe("buildDiagnosticClipboard", () => {
  const baseParams = {
    serverStatus: { state: "connected" } as ServerStatus,
    peerStatus: { state: "connected" } as PeerStatus,
    scrapingStatus: { state: "found" } as ScrapingStatus,
    extensionVersion: "0.11.0",
    userAgent: "Mozilla/5.0 Chrome/120.0",
  };

  it("includes all status fields", () => {
    const text = buildDiagnosticClipboard(baseParams);
    expect(text).toContain("Server status: connected");
    expect(text).toContain("Peer status: connected");
    expect(text).toContain("Contact scraping: found");
    expect(text).toContain("Extension version: 0.11.0");
    expect(text).toContain("Browser: Mozilla/5.0 Chrome/120.0");
  });

  it("includes server error detail", () => {
    const text = buildDiagnosticClipboard({
      ...baseParams,
      serverStatus: { state: "error", error: "WebSocket timed out after 15s" },
    });
    expect(text).toContain(
      "Server status: error (WebSocket timed out after 15s)",
    );
  });

  it("includes page hints when scraping fails", () => {
    const text = buildDiagnosticClipboard({
      ...baseParams,
      scrapingStatus: {
        state: "not_found",
        platform: "everyaction",
        pageHints: {
          url: "https://example.everyaction.com/ContactDetailScript",
          bodyClasses: "van-page",
          elementIds: ["main", "sidebar"],
          selectorsExpected: ["#current-number", ".person-phone-panel"],
          phoneNumberLocations: [
            {
              number: "(555) 123-4567",
              domPath: "body > div.grid-half > span#phone",
            },
          ],
          htmlStructure: "div.grid-half\n  span#phone",
        },
      },
    });
    expect(text).toContain("Platform: everyaction");
    expect(text).toContain("Page URL: https://example.everyaction.com");
    expect(text).toContain("#current-number");
    expect(text).toContain("(555) 123-4567");
    expect(text).toContain("div.grid-half");
  });
});

describe("buildReportIssueMailto", () => {
  it("returns a mailto URL to evan@turbovpb.com", () => {
    const url = buildReportIssueMailto();
    expect(url.startsWith("mailto:evan@turbovpb.com")).toBe(true);
    expect(url).toContain("subject=");
    expect(url).toContain("body=");
  });

  it("includes instructions to paste clipboard", () => {
    const url = buildReportIssueMailto();
    const body = decodeURIComponent(url.split("body=")[1]);
    expect(body).toContain("paste");
    expect(body).toContain("clipboard");
  });
});
