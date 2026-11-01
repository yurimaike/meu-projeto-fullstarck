import { describe, expect, it } from "vitest";
import { buildBetterAuthSessionHeaders } from "../../middlewares/with-session";

describe("Better Auth session request headers", () => {
  it("forwards the Render client IP only when the proxy is explicitly trusted", () => {
    const request = new Request("https://api.example.test/api/private", {
      headers: {
        Authorization: "Bearer session-token",
        "x-forwarded-for": "203.0.113.10, 198.51.100.20",
        "user-agent": "Test browser",
        Cookie: "private-cookie=value",
        Host: "untrusted.example.test"
      }
    });

    const trustedHeaders = buildBetterAuthSessionHeaders(request, true);
    expect(trustedHeaders.get("Authorization")).toBe("Bearer session-token");
    expect(trustedHeaders.get("x-forwarded-for")).toBe("203.0.113.10, 198.51.100.20");
    expect(trustedHeaders.get("user-agent")).toBe("Test browser");
    expect(trustedHeaders.has("cookie")).toBe(false);
    expect(trustedHeaders.has("host")).toBe(false);

    const untrustedHeaders = buildBetterAuthSessionHeaders(request, false);
    expect(untrustedHeaders.get("Authorization")).toBe("Bearer session-token");
    expect(untrustedHeaders.get("x-forwarded-for")).toBeNull();
  });

  it("does not invent forwarded headers when the request has none", () => {
    const request = new Request("https://api.example.test/api/private", {
      headers: { Authorization: "Bearer session-token" }
    });

    const headers = buildBetterAuthSessionHeaders(request, true);
    expect(headers.get("x-forwarded-for")).toBeNull();
  });
});
