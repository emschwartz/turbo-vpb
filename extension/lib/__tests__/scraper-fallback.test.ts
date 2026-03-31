import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import * as openvpb from "../vpb-integrations/openvpb";
import * as everyaction from "../vpb-integrations/everyaction";
import * as bluevote from "../vpb-integrations/bluevote";

// jsdom does not implement innerText; polyfill it with textContent so
// the scrapers (which use innerText) can read element text in tests.
beforeAll(() => {
  if (!("innerText" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      get() {
        return this.textContent;
      },
      configurable: true,
    });
  }
});

describe("scraper fallback integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("openvpb", () => {
    it("returns high confidence when primary selectors match", () => {
      document.body.innerHTML = `
        <div id="openvpbsidebarcontainer"></div>
        <span id="contactName">John Smith</span>
        <a id="openVpbPhoneLink" href="tel:5551234567">555-123-4567</a>
      `;
      const result = openvpb.scrapeContactDetails();
      expect(result?.confidence).toBe("high");
      expect(result?.phoneNumber).toBe("555-123-4567");
    });

    it("falls back to generic scraper with low confidence", () => {
      document.body.innerHTML = `
        <div>
          <h2>Jane Doe</h2>
          <a href="tel:5559876543">555-987-6543</a>
        </div>
      `;
      const result = openvpb.scrapeContactDetails();
      expect(result?.confidence).toBe("low");
      expect(result?.phoneNumber).toBe("555-987-6543");
      expect(result?.firstName).toBe("Jane");
      expect(result?.lastName).toBe("Doe");
      expect(result?.additionalFields).toEqual({});
    });

    it("returns undefined when both primary and fallback fail", () => {
      document.body.innerHTML = `<div>Nothing here</div>`;
      expect(openvpb.scrapeContactDetails()).toBeUndefined();
    });
  });

  describe("everyaction", () => {
    it("returns high confidence when primary selectors match", () => {
      document.body.innerHTML = `
        <div class="grid-half"></div>
        <div class="person-phone-panel"><span>Bob Jones</span></div>
        <div id="current-number"><a href="tel:5551234567">555-123-4567</a></div>
      `;
      const result = everyaction.scrapeContactDetails();
      expect(result?.confidence).toBe("high");
    });

    it("falls back to generic scraper with low confidence", () => {
      document.body.innerHTML = `
        <div>
          <strong>Alice Brown</strong>
          <a href="tel:5559876543">555-987-6543</a>
        </div>
      `;
      const result = everyaction.scrapeContactDetails();
      expect(result?.confidence).toBe("low");
      expect(result?.phoneNumber).toBe("555-987-6543");
      expect(result?.firstName).toBe("Alice");
    });
  });

  describe("bluevote", () => {
    it("returns high confidence when primary selectors match", () => {
      document.body.innerHTML = `
        <div class="caller-info"></div>
        <span id="voter-name">Charlie Davis</span>
        <span id="main-phone">555-123-4567</span>
      `;
      const result = bluevote.scrapeContactDetails();
      expect(result?.confidence).toBe("high");
    });

    it("falls back to generic scraper with low confidence", () => {
      document.body.innerHTML = `
        <div>
          <h3>Dana White</h3>
          <a href="tel:5559876543">555-987-6543</a>
        </div>
      `;
      const result = bluevote.scrapeContactDetails();
      expect(result?.confidence).toBe("low");
      expect(result?.phoneNumber).toBe("555-987-6543");
      expect(result?.firstName).toBe("Dana");
    });
  });
});
