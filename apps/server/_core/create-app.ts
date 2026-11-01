import { Hono } from "hono";
import { cors } from "hono/cors";
import { routeEntries } from "./route-registry";
import { withSession } from "../middlewares/with-session";
import { notFound } from "../middlewares/not-found";
import { onError } from "../middlewares/on-error";
import { getAuth } from "./auth";
import { isDatabaseConfigured } from "./db";
import { getAllowedOrigin } from "./env";
import { apiFailure } from "@repo/shared/http";

const app = new Hono({ strict: false });

app.use(
  "/api/*",
  cors({
    origin: (origin) => getAllowedOrigin(origin),
    exposeHeaders: ["set-auth-token"],
    allowHeaders: ["Authorization", "Content-Type", "X-Auth-Return-Redirect"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);

app.options("/api/auth/*", (c) => c.body(null, 204));
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  if (!isDatabaseConfigured()) {
    return c.json(apiFailure("DATABASE_UNCONFIGURED", "Skybase database runtime env is not configured"), 503);
  }

  // Every email/password sign-in and sign-up requires current admin authorisation.
  // Removing an address therefore blocks both future logins and account creation.
  const authPath = new URL(c.req.url).pathname;
  if (c.req.method === "POST" && ["/api/auth/sign-up/email", "/api/auth/sign-in/email"].includes(authPath)) {
    const body = await c.req.raw.clone().json().catch(() => null) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json(apiFailure("INVALID_EMAIL", "Informe um e-mail válido."), 400);
    }
    const { executeSql } = await import("./db");
    const authorised = await executeSql("SELECT email FROM authorized_emails WHERE email = ? LIMIT 1", [email]);
    if (authorised.rows.length === 0) {
      return c.json(apiFailure("EMAIL_NOT_AUTHORIZED", "Este e-mail ainda não foi autorizado pelo administrador."), 403);
    }
  }

  return getAuth().handler(c.req.raw);
});
app.use("/api/*", withSession);

// Routes are auto-discovered from apps/server/routes/*.route.ts and mounted at
// /api/<name>. To add an endpoint, add a route file — no edits needed here.
for (const { path, router } of routeEntries) {
  app.route(path, router);
}

app.onError(onError);
app.notFound(notFound);

export default app;
