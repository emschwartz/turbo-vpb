import { describe, it, expect } from "vitest";
import { isAllowedServerUrl } from "../server-url";

describe("isAllowedServerUrl", () => {
  it("allows https servers and a local http one", () => {
    expect(isAllowedServerUrl("https://turbovpb.com")).toBe(true);
    expect(isAllowedServerUrl("https://relay.example.org:8443/")).toBe(true);
    expect(isAllowedServerUrl("http://localhost:8080")).toBe(true);
    expect(isAllowedServerUrl("http://localhost")).toBe(true);
  });

  it("rejects plain http, lookalike hosts and junk", () => {
    expect(isAllowedServerUrl("http://turbovpb.com")).toBe(false);
    // Only the host "localhost" is local, not a domain that starts with it
    expect(isAllowedServerUrl("http://localhost.evil.example")).toBe(false);
    expect(isAllowedServerUrl("http://localhost@evil.example")).toBe(false);
    expect(isAllowedServerUrl("ftp://localhost")).toBe(false);
    expect(isAllowedServerUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedServerUrl("not a url")).toBe(false);
  });
});
