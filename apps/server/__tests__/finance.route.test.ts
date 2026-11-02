import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } from "../_test/helpers";

beforeAll(async () => { await applyMigrations(); });
beforeEach(async () => {
  await resetDatabase();
  await executeSql("DELETE FROM finance_transaction_audit");
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

  it("allows admins to correct a saved expense and records an audit trail", async () => {
    const admin = await createAdmin("finance-admin-edit@example.com");
    const created = await fetchWithAuth(app, admin.token, "/api/finance/expenses", {
      method: "POST",
      body: JSON.stringify({ amountCents: 12000, category: "Materiais", description: "meso", transactionDate: "2026-11-01" })
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { data: { id: string } };
    const updated = await fetchWithAuth(app, admin.token, "/api/finance/" + createdBody.data.id, {
      method: "PATCH",
      body: JSON.stringify({ amountCents: 10000, category: "Materiais", description: "mesa", transactionDate: "2026-11-02" })
    });
    expect(updated.status).toBe(200);
    const row = await executeSql("SELECT amountCents,description,transactionDate FROM finance_transactions WHERE id=?", [createdBody.data.id]);
    expect(row.rows[0]).toMatchObject({ amountCents: 10000, description: "mesa", transactionDate: "2026-11-02" });
    const audit = await executeSql("SELECT oldValues,newValues FROM finance_transaction_audit WHERE transactionId=?", [createdBody.data.id]);
    expect(audit.rows).toHaveLength(1);
    expect(JSON.parse(String(audit.rows[0].oldValues))).toMatchObject({ amountCents: 12000, description: "meso" });
    expect(JSON.parse(String(audit.rows[0].newValues))).toMatchObject({ amountCents: 10000, description: "mesa" });
  });

  it("does not allow customers to edit finance transactions", async () => {
    const admin = await createAdmin("finance-admin-edit-auth@example.com");
    const customer = await signUpAndGetToken(app, { email: "finance-customer-edit@example.com" });
    const created = await fetchWithAuth(app, admin.token, "/api/finance/expenses", {
      method: "POST",
      body: JSON.stringify({ amountCents: 5000, category: "Materiais", description: "Teste", transactionDate: "2026-11-01" })
    });
    const createdBody = await created.json() as { data: { id: string } };
    const response = await fetchWithAuth(app, customer.token, "/api/finance/" + createdBody.data.id, {
      method: "PATCH",
      body: JSON.stringify({ amountCents: 5000, category: "Materiais", description: "Alterado", transactionDate: "2026-11-01" })
    });
    expect(response.status).toBe(403);
  });

});
