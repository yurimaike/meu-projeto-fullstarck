import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { commercialAssistantRouter, isPublic } from "../routes/commercial-assistant.route";

vi.mock("../services/platform-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/platform-ai")>();
  return { ...actual, requestPlatformAIChat: vi.fn() };
});

import { requestPlatformAIChat } from "../services/platform-ai";

const mockedRequestPlatformAIChat = requestPlatformAIChat as ReturnType<typeof vi.fn>;

function buildTestApp() {
  const app = new Hono({ strict: false });
  app.route("/commercial-assistant", commercialAssistantRouter);
  return app;
}

describe("commercial-assistant route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("é uma rota pública (isPublic = true)", () => {
    expect(isPublic).toBe(true);
  });

  it("retorna 400 para corpo vazio", async () => {
    const app = buildTestApp();
    const res = await app.request("/commercial-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: ""
    });
    expect(res.status).toBe(400);
  });

  it("retorna 400 para JSON inválido", async () => {
    const app = buildTestApp();
    const res = await app.request("/commercial-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid json"
    });
    expect(res.status).toBe(400);
  });

  it("retorna 400 para mensagem vazia", async () => {
    const app = buildTestApp();
    const res = await app.request("/commercial-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene_key: "commercial_chat",
        messages: [{ role: "user", content: "" }]
      })
    });
    expect(res.status).toBe(400);
  });

  it("retorna 400 para mensagem acima de 2000 caracteres", async () => {
    const app = buildTestApp();
    const longMessage = "a".repeat(2001);
    const res = await app.request("/commercial-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene_key: "commercial_chat",
        messages: [{ role: "user", content: longMessage }]
      })
    });
    expect(res.status).toBe(400);
  });

  it("bloqueia scene_key não permitida", async () => {
    const app = buildTestApp();
    const res = await app.request("/commercial-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene_key: "admin_chat",
        messages: [{ role: "user", content: "Olá" }]
      })
    });
    expect(res.status).toBe(400);
  });

  it("aceita rotas com e sem barra final", async () => {
    const app = buildTestApp();
    mockedRequestPlatformAIChat.mockResolvedValue({ reply: "Olá!" });

    const res1 = await app.request("/commercial-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene_key: "commercial_chat",
        messages: [{ role: "user", content: "Olá" }]
      })
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/commercial-assistant/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene_key: "commercial_chat",
        messages: [{ role: "user", content: "Olá" }]
      })
    });
    expect(res2.status).toBe(200);
  });

  it("retorna erro amigável quando a IA falha", async () => {
    const app = buildTestApp();
    mockedRequestPlatformAIChat.mockRejectedValue(new Error("Falha na IA"));

    const res = await app.request("/commercial-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene_key: "commercial_chat",
        messages: [{ role: "user", content: "Olá" }]
      })
    });
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
