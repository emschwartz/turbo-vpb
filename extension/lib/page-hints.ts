import { PageHints, PhoneNumberLocation } from "./types";

const PHONE_REGEX = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const MAX_ELEMENT_IDS = 20;
const MAX_STRUCTURE_DEPTH = 4;

export function collectPageHints(
  url: string,
  selectorsExpected: string[],
): PageHints {
  return {
    url,
    bodyClasses: document.body.className,
    elementIds: collectElementIds(),
    selectorsExpected,
    phoneNumberLocations: findPhoneNumbers(),
    htmlStructure: buildHtmlStructure(document.body, 0),
  };
}

function collectElementIds(): string[] {
  const elements = document.querySelectorAll("[id]");
  const ids: string[] = [];
  for (let i = 0; i < elements.length && ids.length < MAX_ELEMENT_IDS; i++) {
    ids.push(elements[i].id);
  }
  return ids;
}

function findPhoneNumbers(): PhoneNumberLocation[] {
  const locations: PhoneNumberLocation[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? "";
    const matches = text.matchAll(PHONE_REGEX);
    for (const match of matches) {
      locations.push({
        number: match[0],
        domPath: buildDomPath(node.parentElement),
      });
    }
  }
  return locations;
}

function buildDomPath(element: Element | null): string {
  const parts: string[] = [];
  let current = element;
  while (current && current !== document.documentElement) {
    parts.unshift(describeElement(current));
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function describeElement(el: Element): string {
  let desc = el.tagName.toLowerCase();
  if (el.id) desc += `#${el.id}`;
  if (el.className && typeof el.className === "string") {
    const classes = el.className.trim().split(/\s+/).slice(0, 3);
    if (classes.length > 0 && classes[0] !== "") {
      desc += `.${classes.join(".")}`;
    }
  }
  return desc;
}

function buildHtmlStructure(element: Element, depth: number): string {
  if (depth > MAX_STRUCTURE_DEPTH) return "";
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  const children = element.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const tag = child.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "svg") continue;
    lines.push(`${indent}${describeElement(child)}`);
    const nested = buildHtmlStructure(child, depth + 1);
    if (nested) lines.push(nested);
  }
  return lines.join("\n");
}
