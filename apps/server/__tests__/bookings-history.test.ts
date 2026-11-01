import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_core/db", () => ({
  DatabaseError: class DatabaseError extends Error {
    constructor(readonly code: string, message: string, readonly status = 500) { super(message); }
  },
  executeSql: vi.fn()
}));

describe("customer booking history access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses only the verified account id and normalized verified email as query scope", async () => {
    const { executeSql } = await import("../_core/db");
    const execute = vi.mocked(executeSql);
    execute.mockResolvedValue({ rows: [{ id: "booking-1", service: "Manicure e pedicure" }] } as never);
    const { listCustomerBookings } = await import("../services/bookings");

    const rows = await listCustomerBookings("account-1", " Client@Example.com ");

    expect(rows).toEqual([{ id: "booking-1", service: "Manicure e pedicure" }]);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("WHERE userId = ? OR (userId IS NULL AND lower(customerEmail) = ?)") ,
      ["account-1", "client@example.com"]
    );
    expect(String(execute.mock.calls[0]?.[0])).not.toMatch(/customerEmail,customerPhone|bookingCode/);
  });

  it("associates new reservations only when the verified account email matches the booking email", async () => {
    const { executeSql } = await import("../_core/db");
    const execute = vi.mocked(executeSql);
    execute.mockResolvedValue({ rowsAffected: 1, rows: [] } as never);
    const { createBooking } = await import("../services/bookings");
    const booking = {
      customerName: "Cliente Teste",
      customerEmail: "cliente@example.com",
      customerPhone: "51999990000",
      bookingDate: "2099-12-30",
      bookingTime: "09:30" as const,
      service: "Manicure e pedicure" as const
    };

    await createBooking(booking, { id: "account-1", email: "outro@example.com" });

    const insertArguments = execute.mock.calls[0]?.[1];
    expect(insertArguments?.at(-1)).toBeNull();
  });

  it("maps only the active time-slot unique constraint to a booking conflict", async () => {
    const { executeSql } = await import("../_core/db");
    const execute = vi.mocked(executeSql);
    execute.mockRejectedValue(new Error("UNIQUE constraint failed: bookings.bookingDate, bookings.bookingTime"));
    const { createBooking } = await import("../services/bookings");
    const input = {
      customerName: "Cliente Teste",
      customerEmail: "cliente@example.com",
      customerPhone: "51999990000",
      bookingDate: "2099-12-30",
      bookingTime: "09:30" as const,
      service: "Manicure e pedicure" as const
    };

    await expect(createBooking(input)).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE", status: 409 });
    execute.mockRejectedValue(new Error("UNIQUE constraint failed: bookings.bookingCode"));
    await expect(createBooking(input)).rejects.toThrow("UNIQUE constraint failed: bookings.bookingCode");
  });
});
