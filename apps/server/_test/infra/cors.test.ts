// T4-infra: CORS contract
//
// CORS must allow only configured origins and expose `set-auth-token` so the
// bearer plugin can hand session tokens to the browser. These checks mirror
// the current allow-list contract; they must not require arbitrary reflection.

import { describe, expect, it } from "vitest";
import app from "../../_core/create-app";
import { env } from "../../_core/env";

const ORIGIN = env.ALLOWED_ORIGINS[0];
if (!ORIGIN) throw new Error("CORS tests require a configured test origin");

describe("cors: preflight", () => {
  it("OPTIONS /api/todos allows a configured Origin", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos", {
        method: "OPTIONS",
        headers: {
          origin: ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type"
        }
      })
    );

    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("does not allow an unconfigured Origin", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos", {
        method: "OPTIONS",
        headers: {
          origin: "https://unconfigured.invalid",
          "access-control-request-method": "POST"
        }
      })
    );

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("OPTIONS /api/todos allows POST/PUT/PATCH/DELETE/GET", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos", {
        method: "OPTIONS",
        headers: {
          origin: ORIGIN,
          "access-control-request-method": "POST"
        }
      })
    );

    const allowed = (res.headers.get("access-control-allow-methods") ?? "").toUpperCase();
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      expect(allowed).toContain(method);
    }
  });
});

describe("cors: credentials + expose-headers", () => {
  it("credentials are allowed (so cookies / Authorization can ride)", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos", {
        method: "OPTIONS",
        headers: {
          origin: ORIGIN,
          "access-control-request-method": "GET"
        }
      })
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("set-auth-token is in access-control-expose-headers", async () => {
    // Hono's cors() emits expose-headers on actual responses (not preflight).
    const res = await app.fetch(
      new Request("http://localhost/api/health", {
        headers: { origin: ORIGIN }
      })
    );

    const exposed = (res.headers.get("access-control-expose-headers") ?? "").toLowerCase();
    expect(exposed).toContain("set-auth-token");
  });
});
