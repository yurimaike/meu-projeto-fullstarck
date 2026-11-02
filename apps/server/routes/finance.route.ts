import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute } from "../_core/route-helpers";
import { DatabaseError, executeSql } from "../_core/db";
import { bodySizeLimit } from "../middlewares/body-size-limit";

export const financeRouter = new Hono();
const expenseSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(240),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
const incomeSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
const editSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(240),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
function fail(c: any, error: unknown) {
  if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status as 400|403|404|409|502|503);
  throw error;
}

financeRouter.get("/", adminRoute, async (c) => {
  try {
    const from = c.req.query("from") ?? "0001-01-01";
    const to = c.req.query("to") ?? "9999-12-31";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return c.json(apiFailure("INVALID_DATE_RANGE", "Informe um período válido."), 400);
    }
    const [totals, transactions] = await Promise.all([
      executeSql("SELECT COALESCE(SUM(CASE WHEN type='income' THEN amountCents ELSE 0 END),0) AS incomeCents, COALESCE(SUM(CASE WHEN type='expense' THEN amountCents ELSE 0 END),0) AS expenseCents FROM finance_transactions WHERE transactionDate BETWEEN ? AND ?", [from, to]),
      executeSql("SELECT id,type,amountCents,category,description,transactionDate,bookingId,createdAt FROM finance_transactions WHERE transactionDate BETWEEN ? AND ? ORDER BY transactionDate DESC,createdAt DESC LIMIT 500", [from, to])
    ]);
    const incomeCents = Number(totals.rows[0]?.incomeCents ?? 0);
    const expenseCents = Number(totals.rows[0]?.expenseCents ?? 0);
    return c.json(apiSuccess({ incomeCents, expenseCents, balanceCents: incomeCents-expenseCents, transactions: transactions.rows }));
  } catch (error) { return fail(c, error); }
});

financeRouter.post("/expenses", adminRoute, bodySizeLimit, async (c) => {
  const parsed = expenseSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Confira valor, categoria, descrição e data da despesa."), 400);
  try {
    const user = c.get("currentUser") as { id?: string } | undefined;
    if (!user?.id) return c.json(apiFailure("UNAUTHENTICATED", "Sessão administrativa necessária."), 401);
    const id = randomUUID();
    await executeSql("INSERT INTO finance_transactions (id,type,amountCents,category,description,transactionDate,createdBy) VALUES (?,'expense',?,?,?,?,?)",
      [id, parsed.data.amountCents, parsed.data.category, parsed.data.description, parsed.data.transactionDate, user.id]);
    return c.json(apiSuccess({ id }), 201);
  } catch (error) { return fail(c, error); }
});

financeRouter.patch("/:id", adminRoute, bodySizeLimit, async (c) => {
  const parsed = editSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Confira valor, categoria, descrição e data do lançamento."), 400);
  try {
    const user = c.get("currentUser") as { id?: string } | undefined;
    if (!user?.id) return c.json(apiFailure("UNAUTHENTICATED", "Sessão administrativa necessária."), 401);
    const id = c.req.param("id");
    const currentResult = await executeSql(
      "SELECT id,type,amountCents,category,description,transactionDate,bookingId FROM finance_transactions WHERE id=?",
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) return c.json(apiFailure("TRANSACTION_NOT_FOUND", "Lançamento não encontrado."), 404);
    await executeSql(
      "UPDATE finance_transactions SET amountCents=?,category=?,description=?,transactionDate=? WHERE id=?",
      [parsed.data.amountCents, parsed.data.category, parsed.data.description, parsed.data.transactionDate, id]
    );
    await executeSql(
      "INSERT INTO finance_transaction_audit (id,transactionId,changedBy,oldValues,newValues) VALUES (?,?,?,?,?)",
      [randomUUID(), id, user.id, JSON.stringify({
        type: current.type, amountCents: current.amountCents, category: current.category,
        description: current.description, transactionDate: current.transactionDate
      }), JSON.stringify({
        type: current.type, amountCents: parsed.data.amountCents, category: parsed.data.category,
        description: parsed.data.description, transactionDate: parsed.data.transactionDate
      })]
    );
    return c.json(apiSuccess({ id }));
  } catch (error) { return fail(c, error); }
});

financeRouter.post("/bookings/:id/income", adminRoute, bodySizeLimit, async (c) => {
  const parsed = incomeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Informe o valor efetivamente recebido e a data."), 400);
  try {
    const user = c.get("currentUser") as { id?: string } | undefined;
    if (!user?.id) return c.json(apiFailure("UNAUTHENTICATED", "Sessão administrativa necessária."), 401);
    const bookingResult = await executeSql("SELECT id,status,paymentStatus,customerName,service FROM bookings WHERE id=?", [c.req.param("id")]);
    const booking = bookingResult.rows[0];
    if (!booking || String(booking.status) !== "confirmed") return c.json(apiFailure("BOOKING_NOT_ELIGIBLE", "Somente uma reserva aprovada pode receber lançamento de receita."), 409);
    if (String(booking.paymentStatus) !== "paid") return c.json(apiFailure("PAYMENT_NOT_CONFIRMED", "Confirme o recebimento na agenda antes de lançar a receita."), 409);
    const id = randomUUID();
    await executeSql("INSERT INTO finance_transactions (id,type,amountCents,category,description,transactionDate,bookingId,createdBy) VALUES (?,'income',?,'Serviços',?,?,?,?)",
      [id, parsed.data.amountCents, String(booking.service) + " — " + String(booking.customerName), parsed.data.transactionDate, String(booking.id), user.id]);
    return c.json(apiSuccess({ id }), 201);
  } catch (error) {
    if (error instanceof DatabaseError && /UNIQUE constraint failed: finance_transactions.bookingId/i.test(error.databaseMessage)) {
      return c.json(apiFailure("INCOME_ALREADY_RECORDED", "Esta reserva já possui um lançamento de receita."), 409);
    }
    return fail(c, error);
  }
});
