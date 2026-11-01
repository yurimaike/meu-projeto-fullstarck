import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } from "../_test/helpers";

beforeAll(async () => { await applyMigrations(); });
beforeEach(async () => { await resetDatabase(); });

describe("admin email authorizations", () => {
  it("blocks public sign-up until an administrator authorises the exact email", async () => {
    const response = await app.fetch(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ name: "Not allowed", email: "not-allowed@example.com", password: "password1234" })
    }));
    expect(response.status).toBe(403);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("EMAIL_NOT_AUTHORIZED");
  });

  it("lets an admin add an email and only that exact address sign up", async () => {
    const admin = await signUpAndGetToken(app, { email: "admin-authorizer@example.com" });
    await executeSql("UPDATE user SET role = 'admin' WHERE id = ?", [admin.userId!]);
    const added = await fetchWithAuth(app, admin.token, "/api/email-authorizations", {
      method: "POST", body: JSON.stringify({ email: "Family.Member@Example.com" })
    });
    expect(added.status).toBe(201);

    const allowed = await app.fetch(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ name: "Family member", email: "family.member@example.com", password: "password1234" })
    }));
    expect(allowed.status).toBe(200);
    
    const denied = await app.fetch(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ name: "Other person", email: "other@example.com", password: "password1234" })
    }));
    expect(denied.status).toBe(403);

    const listed = await fetchWithAuth(app, admin.token, "/api/email-authorizations");
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ ok: true, data: { emails: [{ email: "family.member@example.com" }] } });
  });

  it("revoking an email blocks password login and previously issued API sessions", async () => {
    const admin = await signUpAndGetToken(app, { email: "admin-revoke@example.com" });
    await executeSql("UPDATE user SET role = 'admin' WHERE id = ?", [admin.userId!]);
    const staff = await signUpAndGetToken(app, { email: "staff-revoke@example.com" });

    const removed = await fetchWithAuth(
      app,
      admin.token,
      "/api/email-authorizations/staff-revoke%40example.com",
      { method: "DELETE" }
    );
    expect(removed.status).toBe(200);

    const login = await app.fetch(new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "staff-revoke@example.com", password: "password1234" })
    }));
    expect(login.status).toBe(403);
    const loginBody = await login.json() as { error?: { code?: string } };
    expect(loginBody.error?.code).toBe("EMAIL_NOT_AUTHORIZED");

    const oldSession = await fetchWithAuth(app, staff.token, "/api/email-authorizations");
    expect(oldSession.status).toBe(401);
  });

  it("does not let a normal account manage the authorisation list", async () => {
    const user = await signUpAndGetToken(app, { email: "regular-user@example.com" });
    const response = await fetchWithAuth(app, user.token, "/api/email-authorizations", {
      method: "POST", body: JSON.stringify({ email: "friend@example.com" })
    });
    expect(response.status).toBe(403);
  });
});
