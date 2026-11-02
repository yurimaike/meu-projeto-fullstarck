import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } from "../_test/helpers";

beforeAll(async () => { await applyMigrations(); });
beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM finance_transactions");
  await executeSql("DELETE FROM bookings");
});

async function createAdmin(email: string) {
  const admin = await signUpAndGetToken(app, { email });
  if (!admin.userId) throw new Error("Admin fixture did not return a user id");
  await executeSql("UPDATE user SET role='admin' WHERE id=?", [admin.userId]);
  return admin;
}

describe("admin finance route", () => {
  it("denies finance data to a normal customer account", async () => {
    const customer = await signUpAndGetToken(app, { email: "finance-customer@example.com" });
    const response = await fetchWithAuth(app, customer.token, "/api/finance");
    expect(response.status).toBe(403);
  });

  it("records expenses and calculates the real balance", async () => {
    const admin = await createAdmin("finance-admin-expense@example.com");
    const expense = await fetchWithAuth(app, admin.token, "/api/finance/expenses", {
      method: "POST",
      body: JSON.stringify({ amountCents: 12500, category: "Materiais", description: "Esmaltes", transactionDate: "2026-11-01" })
    });
    expect(expense.status).toBe(201);
    const response = await fetchWithAuth(app, admin.token, "/api/finance?from=2026-11-01&to=2026-11-30");
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { incomeCents: number; expenseCents: number; balanceCents: number } };
    expect(body.data).toMatchObject({ incomeCents: 0, expenseCents: 12500, balanceCents: -12500 });
  });

  it("records one income for a paid confirmed booking and prevents duplicates", async () => {
    const admin = await createAdmin("finance-admin-income@example.com");
    await executeSql(
      "INSERT INTO bookings (id,bookingCode,customerName,customerEmail,customerPhone,bookingDate,bookingTime,service,status,paymentStatus) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ["finance-booking-1","LET-FIN-1","Cliente Teste","client@example.com","51999999999","2026-11-01","10:00","Manicure e pedicure","confirmed","paid"]
    );
    const first = await fetchWithAuth(app, admin.token, "/api/finance/bookings/finance-booking-1/income", {
      method: "POST",
      body: JSON.stringify({ amountCents: 8500, transactionDate: "2026-11-01" })
    });
    expect(first.status).toBe(201);
    const duplicate = await fetchWithAuth(app, admin.token, "/api/finance/bookings/finance-booking-1/income", {
      method: "POST",
      body: JSON.stringify({ amountCents: 8500, transactionDate: "2026-11-01" })
    });
    expect(duplicate.status).toBe(409);
  });
});
