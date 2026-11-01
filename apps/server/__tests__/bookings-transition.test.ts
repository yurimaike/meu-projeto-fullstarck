import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeSql } from "../_core/db";
import { decideBooking } from "../services/bookings";

// This focused fixture creates only an in-memory table. It deliberately does
// not import the Hono app or call the migration helper.
beforeAll(async () => {
  await executeSql(`CREATE TABLE bookings (
    id TEXT PRIMARY KEY,
    bookingCode TEXT NOT NULL,
    customerName TEXT NOT NULL,
    customerEmail TEXT NOT NULL,
    customerPhone TEXT NOT NULL,
    bookingDate TEXT NOT NULL,
    bookingTime TEXT NOT NULL,
    service TEXT NOT NULL,
    status TEXT NOT NULL,
    updatedAt TEXT,
    decidedAt TEXT,
    decisionNote TEXT
  )`);
});

beforeEach(async () => {
  await executeSql("DELETE FROM bookings");
  await executeSql(
    "INSERT INTO bookings (id, bookingCode, customerName, customerEmail, customerPhone, bookingDate, bookingTime, service, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["booking-1", "LET-TEST", "Test User", "test@example.com", "51999999999", "2030-01-02", "14:30", "Manicure e pedicure", "pending"]
  );
});

describe("booking status transitions without migrations", () => {
  it("allows a pending booking to be confirmed, then cancelled", async () => {
    await expect(decideBooking("booking-1", "confirmed")).resolves.toMatchObject({ status: "confirmed" });
    await expect(decideBooking("booking-1", "cancelled")).resolves.toMatchObject({ status: "cancelled" });
  });

  it("does not allow confirming a booking that is already confirmed", async () => {
    await decideBooking("booking-1", "confirmed");
    await expect(decideBooking("booking-1", "confirmed")).rejects.toMatchObject({ status: 409 });
  });
});
