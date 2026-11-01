import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, resetDatabase, signUpAndGetToken } from "../_test/helpers";
import { executeSql } from "../_core/db";

const emailMock = vi.hoisted(() => ({
  send: vi.fn(async (_input: { email: string; code: string }) => undefined)
}));

vi.mock("../services/message", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/message")>();
  return { ...actual, sendEmailVerificationCode: emailMock.send };
});

let app: typeof import("../_core/create-app").default;

beforeAll(async () => {
  await applyMigrations();
  app = (await import("../_core/create-app")).default;
});

beforeEach(async () => {
  await resetDatabase();
  emailMock.send.mockClear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

async function createUser() {
  const signedUp = await signUpAndGetToken(app);
  const headers = {
    authorization: `Bearer ${signedUp.token}`,
    "content-type": "application/json"
  };
  return { ...signedUp, headers };
}

async function sendCode(headers: Record<string, string>) {
  return app.fetch(new Request("http://localhost/api/email-verification/send-code", {
    method: "POST",
    headers
  }));
}

async function verifyCode(headers: Record<string, string>, code: string) {
  return app.fetch(new Request("http://localhost/api/email-verification/verify-code", {
    method: "POST",
    headers,
    body: JSON.stringify({ code })
  }));
}

describe("email-verification: one-time code security", () => {
  it("sends a code and accepts it once", async () => {
    const user = await createUser();
    const sent = await sendCode(user.headers);
    expect(sent.status).toBe(200);
    expect(emailMock.send).toHaveBeenCalledTimes(1);

    const code = emailMock.send.mock.calls[0]?.[0].code;
    expect(code).toMatch(/^\d{6}$/);

    const verified = await verifyCode(user.headers, code);
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ ok: true, data: { verified: true } });

    const replay = await verifyCode(user.headers, code);
    expect(replay.status).toBe(400);
  });

  it("allows only one concurrent request to consume a valid code", async () => {
    const user = await createUser();
    expect((await sendCode(user.headers)).status).toBe(200);
    const code = emailMock.send.mock.calls[0]?.[0].code;

    const results = await Promise.all([
      verifyCode(user.headers, code),
      verifyCode(user.headers, code)
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("removes a code after five invalid attempts", async () => {
    const user = await createUser();
    expect((await sendCode(user.headers)).status).toBe(200);

    const responses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      responses.push(await verifyCode(user.headers, "000000"));
    }
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 429]);

    const codeRows = await executeSql(
      "SELECT id FROM verification WHERE identifier = ?",
      [`email-verification:${user.email.toLowerCase()}`]
    );
    expect(codeRows.rows).toHaveLength(0);
  });
});
