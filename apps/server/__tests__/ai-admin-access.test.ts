import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../_core/auth";
import { aiRouter } from "../routes/ai.route";

function fakeUser(role: AuthUser["role"]): AuthUser {
  return {
    id: `${role}-1`,
    name: `${role} user`,
    email: `${role}@example.com`,
    emailVerified: true,
    role
  };
}

function createApp(role?: AuthUser["role"]) {
  const app = new Hono();

  if (role) {
    app.use("*", async (c, next) => {
      c.set("user", fakeUser(role));
      await next();
    });
  }

  app.route("/ai", aiRouter);
  return app;
}

describe("admin AI access boundary", () => {
  it("rejects anonymous requests before reaching the AI handler", async () => {
    const response = await createApp().request("/ai", { method: "POST" });
    expect(response.status).toBe(401);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  it("rejects customer accounts before reaching the AI handler", async () => {
    const response = await createApp("user").request("/ai", { method: "POST" });
    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it("allows an administrator through the access gate", async () => {
    const response = await createApp("admin").request("/ai", { method: "POST" });
    // The empty request is rejected by input validation, proving the admin gate passed.
    expect(response.status).toBe(400);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("INVALID_INPUT");
  });

  it("also protects image generation from anonymous visitors", async () => {
    const response = await createApp().request("/ai/images", { method: "POST" });
    expect(response.status).toBe(401);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  it("also protects image generation from customer accounts", async () => {
    const response = await createApp("user").request("/ai/images", { method: "POST" });
    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it("protects the trailing-slash chat route from customer accounts", async () => {
    const response = await createApp("user").request("/ai/", { method: "POST" });
    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("FORBIDDEN");
  });
});
