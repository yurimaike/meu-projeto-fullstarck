import { afterEach, describe, expect, it, vi } from "vitest";

describe("message service with Resend", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends verification code through Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-api-key");
    vi.stubEnv("EMAIL_FROM", "Letícia Nail Designer <onboarding@resend.dev>");

    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmailVerificationCode } = await import("../../services/message");

    await expect(
      sendEmailVerificationCode({
        email: "visitor@example.com",
        code: "123456",
        expiresInMinutes: 10,
        siteName: "Letícia Nail Designer"
      })
    ).resolves.toEqual({ id: "email_123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");

    const options = fetchMock.mock.calls[0]?.[1];
    expect(options?.method).toBe("POST");
    expect(options?.headers).toEqual({
      Authorization: "Bearer test-api-key",
      "Content-Type": "application/json"
    });

    const body = JSON.parse(String(options?.body));
    expect(body.from).toBe("Letícia Nail Designer <onboarding@resend.dev>");
    expect(body.to).toEqual(["visitor@example.com"]);
    expect(body.subject).toContain("Letícia Nail Designer");
    expect(body.html).toContain("123456");
    expect(body.html).toContain("10 minutos");
  });

  it("fails before calling Resend when configuration is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "Letícia Nail Designer <onboarding@resend.dev>");

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmailVerificationCode, MessageServiceError } =
      await import("../../services/message");

    await expect(
      sendEmailVerificationCode({
        email: "visitor@example.com",
        code: "123456",
        expiresInMinutes: 10
      })
    ).rejects.toBeInstanceOf(MessageServiceError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports errors returned by Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-api-key");
    vi.stubEnv("EMAIL_FROM", "Letícia Nail Designer <onboarding@resend.dev>");

    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ message: "Invalid from address" }), {
        status: 422,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmailVerificationCode, MessageServiceError } =
      await import("../../services/message");

    await expect(
      sendEmailVerificationCode({
        email: "visitor@example.com",
        code: "123456",
        expiresInMinutes: 10
      })
    ).rejects.toMatchObject({
      name: "MessageServiceError",
      status: 422,
      message: "Invalid from address"
    });
  });
});