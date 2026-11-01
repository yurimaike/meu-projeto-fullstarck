import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute } from "../_core/route-helpers";
import { DatabaseError, executeSql } from "../_core/db";
import { bodySizeLimit } from "../middlewares/body-size-limit";

export const servicesRouter = new Hono();
const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  durationMinutes: z.number().int().min(5).max(600),
  priceCents: z.number().int().min(0).max(100000000),
  active: z.boolean().optional()
});

function fail(c: any, error: unknown) {
  if (error instanceof DatabaseError) return c.json(apiFailure(error.code, error.message), error.status as 400|403|404|409|502|503);
  throw error;
}

servicesRouter.get("/admin", adminRoute, async (c) => {
  try {
    const result = await executeSql("SELECT id,name,description,durationMinutes,priceCents,active,createdAt,updatedAt FROM salon_services ORDER BY active DESC,name COLLATE NOCASE");
    return c.json(apiSuccess({ services: result.rows }));
  } catch (error) { return fail(c, error); }
});

servicesRouter.post("/", adminRoute, bodySizeLimit, async (c) => {
  const parsed = serviceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Confira nome, duração e preço do serviço."), 400);
  try {
    const value = parsed.data;
    const id = randomUUID();
    await executeSql(
      "INSERT INTO salon_services (id,name,description,durationMinutes,priceCents,active) VALUES (?,?,?,?,?,?)",
      [id,value.name,value.description?.trim() || null,value.durationMinutes,value.priceCents,value.active === false ? 0 : 1]
    );
    return c.json(apiSuccess({ id }), 201);
  } catch (error) { return fail(c, error); }
});

servicesRouter.patch("/:id", adminRoute, bodySizeLimit, async (c) => {
  const parsed = serviceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Confira nome, duração e preço do serviço."), 400);
  try {
    const value = parsed.data;
    const result = await executeSql(
      "UPDATE salon_services SET name=?,description=?,durationMinutes=?,priceCents=?,active=?,updatedAt=CURRENT_TIMESTAMP WHERE id=?",
      [value.name,value.description?.trim() || null,value.durationMinutes,value.priceCents,value.active === false ? 0 : 1,c.req.param("id")]
    );
    if (Number(result.rowsAffected) !== 1) return c.json(apiFailure("SERVICE_NOT_FOUND", "Serviço não encontrado."), 404);
    return c.json(apiSuccess({ updated: true }));
  } catch (error) { return fail(c, error); }
});

// Keep the record for historical reporting; deletion is a soft deactivation.
servicesRouter.delete("/:id", adminRoute, async (c) => {
  try {
    const result = await executeSql("UPDATE salon_services SET active=0,updatedAt=CURRENT_TIMESTAMP WHERE id=?", [c.req.param("id")]);
    if (Number(result.rowsAffected) !== 1) return c.json(apiFailure("SERVICE_NOT_FOUND", "Serviço não encontrado."), 404);
    return c.json(apiSuccess({ deactivated: true }));
  } catch (error) { return fail(c, error); }
});
