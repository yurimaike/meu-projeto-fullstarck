import { describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { env } from "../_core/env";

const allowedOrigin = env.ALLOWED_ORIGINS[0];
if (!allowedOrigin) throw new Error("CORS tests require at least one configured test origin");

describe("CORS origin and request header allowlists", () => {
  it("allows a configured development origin and only the web client headers", async () => {
    const response = await app.fetch(new Request("http://localhost/api/bookings", {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type,x-untrusted"
      }
    }));

    const allowed = response.headers.get("Access-Control-Allow-Headers") ?? "";
    expect(response.status).toBeLessThan(300);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
    expect(allowed.toLowerCase()).toContain("authorization");
    expect(allowed.toLowerCase()).toContain("content-type");
    expect(allowed.toLowerCase()).not.toContain("x-untrusted");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("does not grant cross-origin access to an unconfigured origin", async () => {
    const response = await app.fetch(new Request("http://localhost/api/bookings", {
      method: "OPTIONS",
      headers: {
        Origin: "https://attacker.example",
        "Access-Control-Request-Method": "POST"
      }
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects malformed and opaque origins from the CORS allowlist", async () => {
    for (const origin of ["https://localhost:3000/path", "null", "not-an-origin"]) {
      const response = await app.fetch(new Request("http://localhost/api/bookings", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST"
        }
      }));

      expect(response.headers.get("Access-Control-Allow-Origin"), origin).toBeNull();
    }
  });
});
