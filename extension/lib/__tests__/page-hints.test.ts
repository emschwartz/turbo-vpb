import { describe, it, expect, beforeEach } from "vitest";
import { collectPageHints } from "../page-hints";

describe("collectPageHints", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.className = "";
  });

  it("collects body classes", () => {
    document.body.className = "van-page theme-dark";
    const hints = collectPageHints(
      "https://example.everyaction.com/ContactDetailScript",
      [],
    );
    expect(hints.bodyClasses).toBe("van-page theme-dark");
  });

  it("collects element IDs up to 20", () => {
    for (let i = 0; i < 25; i++) {
      const div = document.createElement("div");
      div.id = `element-${i}`;
      document.body.appendChild(div);
    }
    const hints = collectPageHints("https://example.com", []);
    expect(hints.elementIds).toHaveLength(20);
    expect(hints.elementIds[0]).toBe("element-0");
  });

  it("finds phone numbers and their DOM paths", () => {
    document.body.innerHTML = `
      <div class="grid-half">
        <div class="col-lg-6">
          <span id="phone-display">(555) 123-4567</span>
        </div>
      </div>
    `;
    const hints = collectPageHints("https://example.com", []);
    expect(hints.phoneNumberLocations).toHaveLength(1);
    expect(hints.phoneNumberLocations[0].number).toBe("(555) 123-4567");
    expect(hints.phoneNumberLocations[0].domPath).toContain(
      "span#phone-display",
    );
  });

  it("finds phone numbers in tel: links", () => {
    document.body.innerHTML = `
      <a href="tel:5551234567">555-123-4567</a>
    `;
    const hints = collectPageHints("https://example.com", []);
    expect(hints.phoneNumberLocations.length).toBeGreaterThanOrEqual(1);
  });

  it("builds simplified HTML structure", () => {
    document.body.innerHTML = `
      <div id="main" class="container">
        <span class="name">John</span>
        <a href="tel:555">Call</a>
      </div>
    `;
    const hints = collectPageHints("https://example.com", []);
    expect(hints.htmlStructure).toContain("div#main.container");
    expect(hints.htmlStructure).toContain("span.name");
    expect(hints.htmlStructure).toContain("a");
  });

  it("passes through expected selectors", () => {
    const selectors = ["#current-number", ".person-phone-panel"];
    const hints = collectPageHints("https://example.com", selectors);
    expect(hints.selectorsExpected).toEqual(selectors);
  });

  it("includes the page URL", () => {
    const hints = collectPageHints(
      "https://example.everyaction.com/ContactDetailScript/123",
      [],
    );
    expect(hints.url).toBe(
      "https://example.everyaction.com/ContactDetailScript/123",
    );
  });
});
