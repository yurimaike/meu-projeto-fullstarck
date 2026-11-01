import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute } from "../_core/route-helpers";
import { DatabaseError, executeSql } from "../_core/db";
import { BOOKING_SERVICES } from "../services/bookings";

export const loyaltyRouter = new Hono();
const paymentSchema = z.object({ paid: z.boolean() });
const completionSchema = z.object({ completed: z.boolean() });
const settingsSchema = z.object({ enabled: z.boolean().optional(), validityMonths: z.number().int().min(1).max(60).optional() }).refine((value) => value.enabled !== undefined || value.validityMonths !== undefined);
const validitySchema = z.object({ months: z.number().int().min(1).max(60) });
const redeemSchema = z.object({ bookingId: z.string().min(1), service: z.string().trim().min(2).max(120) });

function fail(c: any, error: unknown) {
  if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status as 400|403|404|409|502|503);
  throw error;
}

function expiryFromNow(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

async function syncEarnedReward(email: string, name: string) {
  const setting = await executeSql("SELECT enabled,validityMonths FROM loyalty_settings WHERE id=1");
  if (!Number(setting.rows[0]?.enabled ?? 0)) return;
  const normalized = email.trim().toLowerCase();
  const countResult = await executeSql(
    "SELECT COUNT(*) AS total FROM bookings WHERE lower(customerEmail)=? AND paymentStatus='paid' AND completedAt IS NOT NULL AND status IN ('confirmed','completed')",
    [normalized]
  );
  const total = Number(countResult.rows[0]?.total ?? 0);
  const cycle = Math.floor(total / 8);
  if (cycle < 1) return;
  await executeSql(
    "INSERT OR IGNORE INTO loyalty_rewards (id,customerEmail,customerName,cycleNumber,status,expiresAt) VALUES (?,?,?,?,'earned',?)",
    [randomUUID(), normalized, name, cycle, expiryFromNow(Number(setting.rows[0]?.validityMonths ?? 12))]
  );
}

loyaltyRouter.patch("/bookings/:id/payment", adminRoute, async (c) => {
  const parsed = paymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Informe se o pagamento foi recebido."), 400);
  try {
    const result = await executeSql(
      "UPDATE bookings SET paymentStatus=?, paymentUpdatedAt=CURRENT_TIMESTAMP, updatedAt=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('rejected','cancelled')",
      [parsed.data.paid ? "paid" : "unpaid", c.req.param("id")]
    );
    if (Number(result.rowsAffected) !== 1) return c.json(apiFailure("BOOKING_NOT_FOUND", "Reserva não encontrada ou cancelada."), 404);
    const booking = await executeSql("SELECT customerEmail,customerName FROM bookings WHERE id=?", [c.req.param("id")]);
    if (parsed.data.paid && booking.rows[0]) await syncEarnedReward(String(booking.rows[0].customerEmail), String(booking.rows[0].customerName));
    return c.json(apiSuccess({ paymentStatus: parsed.data.paid ? "paid" : "unpaid" }));
  } catch (error) { return fail(c, error); }
});

loyaltyRouter.patch("/bookings/:id/completion", adminRoute, async (c) => {
  const parsed = completionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Informe se o atendimento foi concluído."), 400);
  try {
    const current = await executeSql("SELECT paymentStatus,status,customerEmail,customerName FROM bookings WHERE id=?", [c.req.param("id")]);
    const booking = current.rows[0];
    if (!booking || ["rejected","cancelled"].includes(String(booking.status))) return c.json(apiFailure("BOOKING_NOT_FOUND", "Reserva não encontrada ou cancelada."), 404);
    if (parsed.data.completed && String(booking.paymentStatus) !== "paid") return c.json(apiFailure("PAYMENT_REQUIRED", "Confirme o pagamento antes de concluir o atendimento."), 409);
    await executeSql(
      "UPDATE bookings SET completedAt=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?",
      [parsed.data.completed ? new Date().toISOString() : null, c.req.param("id")]
    );
    if (parsed.data.completed) await syncEarnedReward(String(booking.customerEmail), String(booking.customerName));
    return c.json(apiSuccess({ completed: parsed.data.completed }));
  } catch (error) { return fail(c, error); }
});

loyaltyRouter.get("/admin", adminRoute, async (c) => {
  try {
    const [settings, rewards, customers] = await Promise.all([
      executeSql("SELECT enabled,validityMonths,updatedAt FROM loyalty_settings WHERE id=1"),
      executeSql("SELECT id,customerEmail,customerName,cycleNumber,status,earnedAt,expiresAt,redeemedAt,redeemedService,redeemedBookingId FROM loyalty_rewards ORDER BY earnedAt DESC"),
      executeSql("SELECT customerEmail,customerName,COUNT(*) AS completedPaid FROM bookings WHERE paymentStatus='paid' AND completedAt IS NOT NULL AND status IN ('confirmed','completed') GROUP BY lower(customerEmail),customerName ORDER BY customerName")
    ]);
    return c.json(apiSuccess({ enabled: Boolean(settings.rows[0]?.enabled), validityMonths: Number(settings.rows[0]?.validityMonths ?? 12), rewards: rewards.rows, customers: customers.rows }));
  } catch (error) { return fail(c, error); }
});

loyaltyRouter.patch("/settings", adminRoute, async (c) => {
  const parsed = settingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Configuração inválida."), 400);
  try {
    if (parsed.data.enabled !== undefined) await executeSql("UPDATE loyalty_settings SET enabled=?, updatedAt=CURRENT_TIMESTAMP WHERE id=1", [parsed.data.enabled ? 1 : 0]);
    if (parsed.data.validityMonths !== undefined) await executeSql("UPDATE loyalty_settings SET validityMonths=?, updatedAt=CURRENT_TIMESTAMP WHERE id=1", [parsed.data.validityMonths]);
    const current = await executeSql("SELECT enabled,validityMonths FROM loyalty_settings WHERE id=1");
    return c.json(apiSuccess({ enabled: Boolean(current.rows[0]?.enabled), validityMonths: Number(current.rows[0]?.validityMonths ?? 12) }));
  } catch (error) { return fail(c, error); }
});

loyaltyRouter.patch("/rewards/:id/validity", adminRoute, async (c) => {
  const parsed = validitySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Informe a validade entre 1 e 60 meses."), 400);
  try {
    const result = await executeSql("UPDATE loyalty_rewards SET expiresAt=? WHERE id=? AND status='earned'", [expiryFromNow(parsed.data.months), c.req.param("id")]);
    if (Number(result.rowsAffected) !== 1) return c.json(apiFailure("REWARD_NOT_FOUND", "Bônus disponível não encontrado."), 404);
    return c.json(apiSuccess({ expiresAt: expiryFromNow(parsed.data.months) }));
  } catch (error) { return fail(c, error); }
});

loyaltyRouter.post("/rewards/:id/redeem", adminRoute, async (c) => {
  const parsed = redeemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Informe a reserva e o serviço escolhido para o bônus."), 400);
  try {
    const setting = await executeSql("SELECT enabled FROM loyalty_settings WHERE id=1");
    if (!Number(setting.rows[0]?.enabled ?? 0)) return c.json(apiFailure("LOYALTY_DISABLED", "O programa de fidelidade está desativado."), 409);
    if (!BOOKING_SERVICES.includes(parsed.data.service as typeof BOOKING_SERVICES[number])) return c.json(apiFailure("INVALID_SERVICE", "Escolha um serviço cadastrado no salão."), 400);
    const rewardResult = await executeSql("SELECT customerEmail,status,expiresAt FROM loyalty_rewards WHERE id=?", [c.req.param("id")]);
    const reward = rewardResult.rows[0];
    if (!reward) return c.json(apiFailure("REWARD_NOT_FOUND", "Bônus não encontrado."), 404);
    if (String(reward.status) !== "earned") return c.json(apiFailure("REWARD_ALREADY_REDEEMED", "Este bônus já foi utilizado."), 409);
    if (reward.expiresAt && new Date(String(reward.expiresAt)).getTime() < Date.now()) return c.json(apiFailure("REWARD_EXPIRED", "A validade deste bônus terminou. Ajuste a validade no painel, se desejar."), 409);
    const bookingResult = await executeSql("SELECT customerEmail,status FROM bookings WHERE id=?", [parsed.data.bookingId]);
    const booking = bookingResult.rows[0];
    if (!booking || String(booking.status) !== "confirmed" || String(booking.customerEmail).toLowerCase() !== String(reward.customerEmail).toLowerCase()) {
      return c.json(apiFailure("BOOKING_MISMATCH", "A reserva precisa estar aprovada e pertencer à mesma cliente do bônus."), 409);
    }
    const updated = await executeSql(
      "UPDATE loyalty_rewards SET status='redeemed', redeemedAt=CURRENT_TIMESTAMP, redeemedBookingId=?, redeemedService=? WHERE id=? AND status='earned'",
      [parsed.data.bookingId, parsed.data.service, c.req.param("id")]
    );
    if (Number(updated.rowsAffected) !== 1) return c.json(apiFailure("REWARD_ALREADY_REDEEMED", "Este bônus já foi utilizado."), 409);
    return c.json(apiSuccess({ redeemed: true, service: parsed.data.service }));
  } catch (error) { return fail(c, error); }
});
