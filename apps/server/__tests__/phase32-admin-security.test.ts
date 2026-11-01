import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } from "../_test/helpers";

beforeAll(async () => {
  // This suite may only mutate the disposable, in-memory test database.
  if (process.env.SKYBASE_DB_ENDPOINT !== ":memory:") {
    throw new Error("Phase32 tests require a disposable :memory: database.");
  }
  await applyMigrations();
});
beforeEach(async () => {
  await executeSql("DELETE FROM bookings");
  await resetDatabase();
});

describe("fase 32 — autorização administrativa real no servidor", () => {
  it("recusa chamadas administrativas sem sessão com 401", async () => {
    const read = await app.fetch(new Request("http://localhost/api/bookings/admin"));
    expect(read.status).toBe(401);
    const write = await app.fetch(new Request("http://localhost/api/bookings/fixture/status", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirmed" })
    }));
    expect(write.status).toBe(401);
  });

  it("conta comum recebe 403 mesmo enviando role admin ao atualizar o perfil", async () => {
    const user = await signUpAndGetToken(app, { email: "ordinary@example.com" });
    await fetchWithAuth(app, user.token, "/api/auth/update-user", {
      method: "POST", headers: { origin: "http://localhost:3000" },
      body: JSON.stringify({ name: "Fixture", role: "admin" })
    });
    const profile = await fetchWithAuth(app, user.token, "/api/me/profile");
    const body = await profile.json() as { data: { profile: { role: string } } };
    expect(body.data.profile.role).toBe("user");
    expect((await fetchWithAuth(app, user.token, "/api/bookings/admin")).status).toBe(403);
    const update = await fetchWithAuth(app, user.token, "/api/bookings/another-customer/status", {
      method: "PATCH", body: JSON.stringify({ action: "cancelled" })
    });
    expect(update.status).toBe(403);
  });

  it("cliente verificado só consulta seu próprio histórico, ignorando identidade da URL", async () => {
    const alice = await signUpAndGetToken(app, { email: "alice-fixture@example.com" });
    const bob = await signUpAndGetToken(app, { email: "bob-fixture@example.com" });
    await executeSql("UPDATE user SET emailVerified = 1 WHERE id IN (?, ?)", [alice.userId!, bob.userId!]);
    for (const [account, time] of [[alice, "11:00"], [bob, "13:00"]] as const) {
      const created = await fetchWithAuth(app, account.token, "/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          customerName: "Cliente de teste", customerEmail: account.email,
          customerPhone: "51999990000", bookingDate: "2099-12-30",
          bookingTime: time, service: "Manicure e pedicure"
        })
      });
      expect(created.status).toBe(201);
    }
    const response = await fetchWithAuth(app, alice.token,
      `/api/bookings/mine?userId=${bob.userId}&email=${encodeURIComponent(bob.email)}`);
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { bookings: Array<{ bookingTime: string }> } };
    expect(body.data.bookings).toHaveLength(1);
    expect(body.data.bookings[0].bookingTime).toBe("11:00");
    expect(JSON.stringify(body)).not.toContain(bob.email);
  });

  it("admin autorizado gerencia reserva e o token revogado não pode ser reutilizado após sair", async () => {
    const account = await signUpAndGetToken(app, { email: "admin-fixture@example.com" });
    // Explicit fixture promotion in the disposable database, never public bootstrap.
    await executeSql("UPDATE user SET role = 'admin' WHERE id = ?", [account.userId!]);
    const created = await app.fetch(new Request("http://localhost/api/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Cliente de teste", customerEmail: "booking-fixture@example.com",
        customerPhone: "51999990000", bookingDate: "2099-12-30",
        bookingTime: "14:30", service: "Manicure e pedicure"
      })
    }));
    expect(created.status).toBe(201);
    const booking = await created.json() as { data: { id: string } };
    expect((await fetchWithAuth(app, account.token, "/api/bookings/admin")).status).toBe(200);
    const confirmed = await fetchWithAuth(app, account.token, `/api/bookings/${booking.data.id}/status`, {
      method: "PATCH", body: JSON.stringify({ action: "confirmed" })
    });
    expect(confirmed.status).toBe(200);
    const logout = await fetchWithAuth(app, account.token, "/api/auth/sign-out", {
      method: "POST", headers: { origin: "http://localhost:3000" },
      body: JSON.stringify({})
    });
    expect(logout.status).toBe(200);
    expect((await fetchWithAuth(app, account.token, "/api/bookings/admin")).status).toBe(401);
  });

  it("token inventado pelo navegador não concede acesso", async () => {
    expect((await fetchWithAuth(app, "forged-admin-token", "/api/bookings/admin")).status).toBe(401);
  });
});
