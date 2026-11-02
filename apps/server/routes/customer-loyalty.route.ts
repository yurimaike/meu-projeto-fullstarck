import { Hono } from "hono";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { protectedRoute } from "../_core/route-helpers";
import { DatabaseError, executeSql } from "../_core/db";

export const customerLoyaltyRouter = new Hono();

customerLoyaltyRouter.get("/mine", protectedRoute, async (c) => {
  const user = c.var.currentUser;
  if (!user.emailVerified) {
    return c.json(apiFailure("EMAIL_NOT_VERIFIED", "Verifique seu e-mail para consultar seus bônus."), 403);
  }

  try {
    const [settings, rewards, progress] = await Promise.all([
      executeSql("SELECT enabled FROM loyalty_settings WHERE id=1"),
      executeSql(
        "SELECT id,status,earnedAt,expiresAt,redeemedAt,redeemedService FROM loyalty_rewards WHERE lower(customerEmail)=? ORDER BY earnedAt DESC",
        [user.email.trim().toLowerCase()]
      ),
      executeSql(
        "SELECT COUNT(*) AS completedPaid FROM bookings WHERE lower(customerEmail)=? AND paymentStatus='paid' AND completedAt IS NOT NULL AND status IN ('confirmed','completed')",
        [user.email.trim().toLowerCase()]
      )
    ]);

    return c.json(apiSuccess({
      enabled: Boolean(settings.rows[0]?.enabled),
      completedPaid: Number(progress.rows[0]?.completedPaid ?? 0),
      bookingsUntilReward: Boolean(settings.rows[0]?.enabled)
        ? 8 - (Number(progress.rows[0]?.completedPaid ?? 0) % 8)
        : null,
      rewards: rewards.rows
    }));
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json(apiFailure(error.code, error.message), error.status as 400|403|404|409|502|503);
    }
    throw error;
  }
});
