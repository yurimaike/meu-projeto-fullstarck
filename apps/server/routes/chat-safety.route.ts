import { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { executeSql } from "../_core/db";
import { adminRoute } from "../_core/route-helpers";

export const chatSafetyRouter = new Hono();

chatSafetyRouter.get("/admin", adminRoute, async (c) => {
  const [incidents, blocks, history] = await Promise.all([
    executeSql("SELECT id, visitor_id AS visitorId, severity, reason, message_excerpt AS messageExcerpt, created_at AS createdAt, status FROM chat_safety_incidents ORDER BY created_at DESC LIMIT 100"),
    executeSql("SELECT visitor_id AS visitorId, blocked_at AS blockedAt, blocked_by AS blockedBy, reason FROM chat_safety_blocks WHERE unblocked_at IS NULL ORDER BY blocked_at DESC LIMIT 100"),
    executeSql("SELECT id, visitor_id AS visitorId, action, actor, reason, created_at AS createdAt FROM chat_safety_block_history ORDER BY created_at DESC LIMIT 100")
  ]);
  return c.json(apiSuccess({ incidents: incidents.rows, blocks: blocks.rows, history: history.rows }));
});

chatSafetyRouter.post("/:visitorId/unblock", adminRoute, async (c) => {
  const visitorId = c.req.param("visitorId");
  const parsed = z.object({ reason: z.string().trim().min(3).max(300) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Informe o motivo do desbloqueio."), 400);
  const result = await executeSql("UPDATE chat_safety_blocks SET unblocked_at = CURRENT_TIMESTAMP, unblocked_by = ? WHERE visitor_id = ? AND unblocked_at IS NULL", [c.var.currentUser.id, visitorId]);
  if (!result.rowsAffected) return c.json(apiFailure("NOT_FOUND", "Não existe bloqueio ativo para este visitante."), 404);
  await executeSql("INSERT INTO chat_safety_block_history (id, visitor_id, action, actor, reason) VALUES (?, ?, 'unblocked', ?, ?)", [randomUUID(), visitorId, c.var.currentUser.id, parsed.data.reason]);
  return c.json(apiSuccess({ visitorId, unblocked: true }));
});

chatSafetyRouter.patch("/incidents/:id/review", adminRoute, async (c) => {
  const parsed = z.object({ status: z.enum(["reviewed", "dismissed"]) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Estado inválido."), 400);
  const result = await executeSql("UPDATE chat_safety_incidents SET status = ? WHERE id = ?", [parsed.data.status, c.req.param("id")]);
  if (!result.rowsAffected) return c.json(apiFailure("NOT_FOUND", "Ocorrência não encontrada."), 404);
  return c.json(apiSuccess({ id: c.req.param("id"), status: parsed.data.status }));
});
