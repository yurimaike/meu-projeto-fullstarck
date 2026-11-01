import { Hono } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { executeSql } from "../_core/db";
import { adminRoute } from "../_core/route-helpers";
import { bodySizeLimit } from "../middlewares/body-size-limit";
import { distributedRateLimit, identityRateLimitCounter } from "../middlewares/distributed-rate-limit";

export const emailAuthorizationsRouter = new Hono();
const schema = z.object({ email: z.string().trim().email().max(254) });
const limit = distributedRateLimit((c) => [
  identityRateLimitCounter("email-authorizations:write", c.var.currentUser?.id, 20, 60)
]);

emailAuthorizationsRouter.get("/", adminRoute, async (c) => {
  const result = await executeSql("SELECT email, createdAt FROM authorized_emails ORDER BY createdAt DESC LIMIT 500");
  return c.json(apiSuccess({ emails: result.rows }));
});

emailAuthorizationsRouter.post("/", adminRoute, limit, bodySizeLimit, async (c) => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_EMAIL", "Informe um e-mail válido."), 400);
  const email = parsed.data.email.toLowerCase();
  await executeSql(
    "INSERT INTO authorized_emails (email, createdBy, createdAt) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING",
    [email, c.var.currentUser.id, Math.floor(Date.now() / 1000)]
  );
  return c.json(apiSuccess({ email }), 201);
});

emailAuthorizationsRouter.delete("/:email", adminRoute, limit, async (c) => {
  const parsed = schema.safeParse({ email: decodeURIComponent(c.req.param("email")) });
  if (!parsed.success) return c.json(apiFailure("INVALID_EMAIL", "E-mail inválido."), 400);
  const email = parsed.data.email.toLowerCase();
  await executeSql("DELETE FROM authorized_emails WHERE email = ?", [email]);
  return c.json(apiSuccess({ email, removed: true }));
});
