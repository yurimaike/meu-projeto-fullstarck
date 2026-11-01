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

  it.each(["/ai/plans/preview", "/ai/plans/approve", "/ai/plans/execute"])("rejects anonymous access to %s", async (path) => {
    const response = await createApp().request(path, { method: "POST" });
    expect(response.status).toBe(401);
  });




  it.each([
    "apps/server/routes/ai.route.ts",
    "apps/client/src/.env",
    "apps/client/src/auth/session.ts",
    "apps/client/src/../../server/secrets.ts",
    "/apps/client/src/pages/Home.tsx",
    "apps/client/src\\\u005csecret.ts"
  ])("rejects an edit plan targeting unsafe path %s", async (unsafePath) => {
    const plan = {
      title: "Alteração proposta",
      summary: "Plano de teste.",
      files: [{ path: unsafePath, operation: "update", reason: "Teste de bloqueio." }],
      risks: [],
      checks: []
    };
    const response = await createApp("admin").request("/ai/plans/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(plan)
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("UNSAFE_FILE_PATH");
  });

  it("accepts a plan limited to an ordinary frontend source file", async () => {
    const plan = {
      title: "Actualizar texto institucional",
      summary: "Corrigir texto da página inicial.",
      files: [{ path: "apps/client/src/content/home.ts", operation: "update", reason: "Texto aprovado." }],
      risks: [],
      checks: ["Rever página inicial"]
    };
    const response = await createApp("admin").request("/ai/plans/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(plan)
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { data?: { approval_required?: boolean; plan_hash?: string } };
    expect(body.data?.approval_required).toBe(true);
    expect(body.data?.plan_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects approval when the submitted plan hash no longer matches", async () => {
    const plan = {
      title: "Actualizar texto institucional",
      summary: "Corrigir texto da página inicial.",
      files: [{ path: "apps/client/src/content/home.ts", operation: "update", reason: "Texto aprovado." }],
      risks: [],
      checks: ["Rever página inicial"]
    };
    const response = await createApp("admin").request("/ai/plans/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, plan_hash: "0".repeat(64) })
    });
    expect(response.status).toBe(409);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("PLAN_CHANGED");
  });

  it("issues a short-lived approval token only for the exact reviewed plan", async () => {
    const plan = {
      title: "Actualizar texto institucional",
      summary: "Corrigir texto da página inicial.",
      files: [{ path: "apps/client/src/content/home.ts", operation: "update", reason: "Texto aprovado." }],
      risks: [],
      checks: ["Rever página inicial"]
    };
    const canonical = JSON.stringify({
      title: plan.title,
      summary: plan.summary,
      files: plan.files,
      risks: plan.risks,
      checks: plan.checks
    });
    const { createHash } = await import("node:crypto");
    const plan_hash = createHash("sha256").update(canonical).digest("hex");
    const response = await createApp("admin").request("/ai/plans/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, plan_hash })
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { data?: { approval_token?: string; expires_at?: string } };
    expect(body.data?.approval_token).toMatch(/^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/);
    expect(Number.isNaN(Date.parse(body.data?.expires_at ?? ""))).toBe(false);
  });

  it("rejects malformed execution requests before the disabled GitHub integration gate", async () => {
    const response = await createApp("admin").request("/ai/plans/execute", { method: "POST" });
    expect(response.status).toBe(400);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("INVALID_INPUT");
  });

  it("rejects a forged approval token before the GitHub integration gate", async () => {
    const plan = {
      title: "Actualizar texto institucional",
      summary: "Corrigir texto da página inicial.",
      files: [{ path: "apps/client/src/content/home.ts", operation: "update", reason: "Texto aprovado." }],
      risks: [],
      checks: ["Rever página inicial"]
    };
    const { createHash } = await import("node:crypto");
    const plan_hash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    const response = await createApp("admin").request("/ai/plans/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, plan_hash, approval_token: "forged.token" })
    });
    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("APPROVAL_INVALID");
  });

  it.each(["/ai/plans/preview", "/ai/plans/approve", "/ai/plans/execute"])("rejects customer access to %s", async (path) => {
    const response = await createApp("user").request(path, { method: "POST" });
    expect(response.status).toBe(403);
  });
});
