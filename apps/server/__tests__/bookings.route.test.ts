import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { executeSql } from "../_core/db";
import { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } from "../_test/helpers";

beforeAll(async () => { await applyMigrations(); });
beforeEach(async () => { await resetDatabase(); await executeSql("DELETE FROM bookings"); });
function futureDate(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
describe("bookings route", () => {
  it("creates pending reservation and lists the slot as busy", async () => {
    const date = futureDate(20);
    const res = await app.fetch(new Request("http://localhost/api/bookings", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({customerName:"Test User",customerEmail:"test@example.com",customerPhone:"51999999999",bookingDate:date,bookingTime:"11:00",service:"Banho de gel"}) }));
    expect(res.status).toBe(201);
    const body = await res.json() as {data:{status:string;id:string;bookingCode:string}};
    expect(body.data.status).toBe("pending");
    expect(body.data.bookingCode).toMatch(/^LET-[A-F0-9]+$/);
    const list = await app.fetch(new Request(`http://localhost/api/bookings?date=${date}`));
    expect(((await list.json()) as {data:{busyTimes:string[]}}).data.busyTimes).toContain("11:00");
  });
  it("blocks duplicate slots using valid customer details", async () => {
    const date = futureDate(21);
    const input = JSON.stringify({customerName:"Test User",customerEmail:"test@example.com",customerPhone:"51999999999",bookingDate:date,bookingTime:"13:00",service:"Manicure e pedicure"});
    const first = await app.fetch(new Request("http://localhost/api/bookings",{method:"POST",headers:{"content-type":"application/json"},body:input}));
    expect(first.status).toBe(201);
    const duplicate = await app.fetch(new Request("http://localhost/api/bookings",{method:"POST",headers:{"content-type":"application/json"},body:input}));
    expect(duplicate.status).toBe(409);
  });
  it("allows an admin to cancel a confirmed reservation and releases its slot", async () => {
    const date = futureDate(22);
    const created = await app.fetch(new Request("http://localhost/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Test User",
        customerEmail: "confirmed@example.com",
        customerPhone: "51999999999",
        bookingDate: date,
        bookingTime: "14:30",
        service: "Manicure e pedicure"
      })
    }));
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { data: { id: string } };

    const admin = await signUpAndGetToken(app, { email: "booking-admin@example.com" });
    if (!admin.userId) throw new Error("Admin fixture did not return a user id");
    await executeSql("UPDATE user SET role = 'admin' WHERE id = ?", [admin.userId]);

    const confirmed = await fetchWithAuth(app, admin.token, `/api/bookings/${createdBody.data.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ action: "confirmed" })
    });
    expect(confirmed.status).toBe(200);

    const cancelled = await fetchWithAuth(app, admin.token, `/api/bookings/${createdBody.data.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ action: "cancelled" })
    });
    expect(cancelled.status).toBe(200);

    const list = await app.fetch(new Request(`http://localhost/api/bookings?date=${date}`));
    expect(((await list.json()) as { data: { busyTimes: string[] } }).data.busyTimes).not.toContain("14:30");
  });
});
