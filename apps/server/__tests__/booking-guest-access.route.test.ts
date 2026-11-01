import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const challenge = vi.hoisted(() => ({ consume: vi.fn(), store: vi.fn(), remove: vi.fn() }));
const email = vi.hoisted(() => ({ send: vi.fn() }));
const database = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../services/upstash-redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/upstash-redis")>();
  return {
    ...actual,
    consumeGuestBookingChallenge: challenge.consume,
    storeGuestBookingChallenge: challenge.store,
    deleteGuestBookingChallenge: challenge.remove
  };
});
vi.mock("../services/message", () => ({ sendGuestBookingAccessCode: email.send }));
vi.mock("../_core/db", () => ({
  DatabaseError: class DatabaseError extends Error {},
  executeSql: database.execute
}));

import { bookingsRouter } from "../routes/bookings.route";

function createApp() {
  const app = new Hono({ strict: false });
  app.route("/bookings", bookingsRouter);
  return app;
}

describe("guest booking history access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    challenge.store.mockResolvedValue(undefined);
    challenge.remove.mockResolvedValue(undefined);
    email.send.mockResolvedValue(undefined);
  });

  it("sends a one-time code and returns a non-enumerating response", async () => {
    const response = await createApp().request("/bookings/guest-access/request-code", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "CLIENT@example.com" })
    });
    const body = await response.json() as { data: { message: string } };

    expect(response.status).toBe(202);
    expect(body.data.message).toContain("Se houver uma reserva");
    expect(challenge.store).toHaveBeenCalledWith("client@example.com", expect.stringMatching(/^\d{6}$/));
    expect(email.send).toHaveBeenCalledWith("client@example.com", expect.stringMatching(/^\d{6}$/));
    expect(database.execute).not.toHaveBeenCalled();
  });

  it("returns only the sanitized reservation projection after a valid one-time code", async () => {
    challenge.consume.mockResolvedValue(true);
    database.execute.mockResolvedValue({ rows: [{ id: "booking-1", bookingDate: "2030-01-02", bookingTime: "09:30", service: "Manicure e pedicure", status: "confirmed" }] });
    const response = await createApp().request("/bookings/guest-access/verify-code", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "CLIENT@example.com", code: "123456" })
    });
    const body = await response.json() as { data: { bookings: Array<Record<string, unknown>> } };

    expect(response.status).toBe(200);
    expect(challenge.consume).toHaveBeenCalledWith("client@example.com", "123456");
    expect(database.execute).toHaveBeenCalledWith(expect.stringContaining("lower(customerEmail) = ?"), ["client@example.com"]);
    expect(body.data.bookings[0]).not.toHaveProperty("customerEmail");
    expect(body.data.bookings[0]).not.toHaveProperty("customerPhone");
    expect(body.data.bookings[0]).not.toHaveProperty("bookingCode");
  });

  it("does not query reservations for an invalid or consumed code", async () => {
    challenge.consume.mockResolvedValue(false);
    const response = await createApp().request("/bookings/guest-access/verify-code", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "client@example.com", code: "000000" })
    });

    expect(response.status).toBe(400);
    expect(database.execute).not.toHaveBeenCalled();
  });
});
