import { describe, it, expect, beforeEach } from "vitest";
import { findPhoneNumber, findName } from "../vpb-integrations/generic-scraper";

describe("findPhoneNumber", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds a single tel: link", () => {
    document.body.innerHTML = `
      <div>
        <a href="tel:5551234567">555-123-4567</a>
      </div>
    `;
    expect(findPhoneNumber(document.body)).toBe("555-123-4567");
  });

  it("returns undefined when no tel: links exist", () => {
    document.body.innerHTML = `<div>No phone here</div>`;
    expect(findPhoneNumber(document.body)).toBeUndefined();
  });

  it("filters out tel: links inside the TurboVPB container", () => {
    document.body.innerHTML = `
      <div id="turbovpb-insert">
        <a href="tel:9999999999">999-999-9999</a>
      </div>
      <a href="tel:5551234567">555-123-4567</a>
    `;
    expect(findPhoneNumber(document.body)).toBe("555-123-4567");
  });

  it("prefers tel: link near 'phone' text when multiple exist", () => {
    document.body.innerHTML = `
      <div>
        <div class="designated-contact">
          <a href="tel:1111111111">111-111-1111</a>
        </div>
        <div>
          <span>Phone:</span>
          <a href="tel:5551234567">555-123-4567</a>
        </div>
      </div>
    `;
    expect(findPhoneNumber(document.body)).toBe("555-123-4567");
  });

  it("returns first tel: link when disambiguation fails", () => {
    document.body.innerHTML = `
      <div>
        <a href="tel:1111111111">111-111-1111</a>
        <a href="tel:2222222222">222-222-2222</a>
      </div>
    `;
    expect(findPhoneNumber(document.body)).toBe("111-111-1111");
  });
});

describe("findName", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds a name in a heading near the phone element", () => {
    document.body.innerHTML = `
      <div>
        <h2>John Smith</h2>
        <a id="phone" href="tel:5551234567">555-123-4567</a>
      </div>
    `;
    const phoneEl = document.getElementById("phone")!;
    const result = findName(phoneEl);
    expect(result).toEqual({ firstName: "John", lastName: "Smith" });
  });

  it("finds a name in a strong element near the phone element", () => {
    document.body.innerHTML = `
      <div>
        <strong>Jane Doe</strong>
        <a id="phone" href="tel:5551234567">555-123-4567</a>
      </div>
    `;
    const phoneEl = document.getElementById("phone")!;
    const result = findName(phoneEl);
    expect(result).toEqual({ firstName: "Jane", lastName: "Doe" });
  });

  it("handles three-word names", () => {
    document.body.innerHTML = `
      <div>
        <h3>Mary Jane Watson</h3>
        <a id="phone" href="tel:5551234567">555-123-4567</a>
      </div>
    `;
    const phoneEl = document.getElementById("phone")!;
    const result = findName(phoneEl);
    expect(result).toEqual({ firstName: "Mary", lastName: "Jane Watson" });
  });

  it("returns undefined when no name-like text is found", () => {
    document.body.innerHTML = `
      <div>
        <span>Some random text 123</span>
        <a id="phone" href="tel:5551234567">555-123-4567</a>
      </div>
    `;
    const phoneEl = document.getElementById("phone")!;
    expect(findName(phoneEl)).toBeUndefined();
  });

  it("ignores text with digits", () => {
    document.body.innerHTML = `
      <div>
        <h2>Contact 3</h2>
        <strong>Alice Johnson</strong>
        <a id="phone" href="tel:5551234567">555-123-4567</a>
      </div>
    `;
    const phoneEl = document.getElementById("phone")!;
    const result = findName(phoneEl);
    expect(result).toEqual({ firstName: "Alice", lastName: "Johnson" });
  });

  it("ignores text that is too long", () => {
    document.body.innerHTML = `
      <div>
        <h2>This Is A Very Long Heading That Should Not Match As A Name Because It Exceeds Fifty</h2>
        <strong>Bob Lee</strong>
        <a id="phone" href="tel:5551234567">555-123-4567</a>
      </div>
    `;
    const phoneEl = document.getElementById("phone")!;
    const result = findName(phoneEl);
    expect(result).toEqual({ firstName: "Bob", lastName: "Lee" });
  });
});
