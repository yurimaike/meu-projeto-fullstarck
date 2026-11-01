import { Hono } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import {
  completeThirdPartyGoogleAuth,
  isThirdPartyGoogleAuthConfigured,
  startThirdPartyGoogleAuth,
  ThirdPartyGoogleAuthError,
  verifySignedLoginToken,
  type GoogleUser
} from "../services/third-party-google-auth";
import { DatabaseError } from "../_core/db";
import { getAllowedOrigin } from "../_core/env";
import { bodySizeLimit } from "../middlewares/body-size-limit";
import { distributedRateLimit, ipRateLimitCounter } from "../middlewares/distributed-rate-limit";

export const isPublic = true;

const StartSchema = z.object({
  origin: z.string().url().optional(),
  landing_path: z.string().optional()
});

const CallbackSchema = z.object({
  user: z.object({}).passthrough(),
  token: z.string().min(1),
  landing_path: z.string().optional()
});

const VerifySchema = z.object({
  path: z.string().min(1),
  token: z.string().min(1),
  ts: z.string().min(1),
  sig: z.string().min(1)
});

export const thirdPartyGoogleAuthRouter = new Hono();

const startRateLimit = distributedRateLimit((c) => [
  ipRateLimitCounter(c, "google-auth:start-ip", 10, 60)
]);
const callbackRateLimit = distributedRateLimit((c) => [
  ipRateLimitCounter(c, "google-auth:callback-ip", 30, 60)
]);
const verifyRateLimit = distributedRateLimit((c) => [
  ipRateLimitCounter(c, "google-auth:verify-ip", 60, 60)
]);

function parsedBody(c: import("hono").Context) {
  const raw = c.get("rawBody") as Uint8Array | undefined;
  if (!raw) return null;
  try { return JSON.parse(new TextDecoder().decode(raw)) as unknown; } catch { return null; }
}

thirdPartyGoogleAuthRouter.get("/config", (c) => {
  return c.json(apiSuccess({ enabled: isThirdPartyGoogleAuthConfigured() }));
});

thirdPartyGoogleAuthRouter.post("/start", startRateLimit, bodySizeLimit, async (c) => {
  const parsed = StartSchema.safeParse(parsedBody(c) ?? {});
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Invalid third-party Google auth start input"), 400);
  }

  const requestUrl = new URL(c.req.url);
  const requestedOrigin = parsed.data.origin ?? c.req.header("Origin") ?? requestUrl.origin;
  const origin = getAllowedOrigin(requestedOrigin);
  if (!origin) {
    return c.json(apiFailure("INVALID_ORIGIN", "Google sign-in origin is not allowed"), 400);
  }
  // Gateway calls this backend return_path after Google auth, then uses our landing_path for the frontend redirect.
  const returnPath = callbackPathWithLandingPath(parsed.data.landing_path ?? "/");

  try {
    const result = await startThirdPartyGoogleAuth(origin, returnPath);
    return c.json(apiSuccess(result), 200);
  } catch (error) {
    return googleAuthError(error);
  }
});

thirdPartyGoogleAuthRouter.post("/callback", callbackRateLimit, bodySizeLimit, async (c) => {
  const parsed = CallbackSchema.safeParse(parsedBody(c));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Invalid third-party Google auth callback input"), 400);
  }

  try {
    const result = await completeThirdPartyGoogleAuth(
      parsed.data.user as GoogleUser,
      parsed.data.token,
      parsed.data.landing_path ?? c.req.query("landing_path") ?? "/"
    );
    return c.json(
      apiSuccess({
        // Gateway should append landing_path to the frontend origin.
        landing_path: result.landingPath,
        // Compatibility for gateway versions that still read data.path.
        path: result.landingPath
      }),
      200
    );
  } catch (error) {
    return googleAuthError(error);
  }
});

thirdPartyGoogleAuthRouter.post("/verify", verifyRateLimit, bodySizeLimit, async (c) => {
  const parsed = VerifySchema.safeParse(parsedBody(c));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Invalid third-party Google auth verification input"), 400);
  }

  const ok = await verifySignedLoginToken(parsed.data.path, parsed.data.token, parsed.data.ts, parsed.data.sig);
  if (!ok) {
    return c.json(apiFailure("INVALID_LOGIN_TOKEN", "Invalid login token signature"), 401);
  }

  return c.json(apiSuccess({ ok: true }), 200);
});

function googleAuthError(error: unknown) {
  if (error instanceof ThirdPartyGoogleAuthError) {
    return Response.json(apiFailure(error.code, error.message), { status: error.status });
  }

  if (error instanceof DatabaseError) {
    return Response.json(apiFailure(error.code, error.message), { status: error.status === 503 ? 503 : 502 });
  }

  throw error;
}

function callbackPathWithLandingPath(landingPath: string) {
  const params = new URLSearchParams({ landing_path: normalizeLandingPath(landingPath) });
  return `/api/third-party-google-auth/callback?${params.toString()}`;
}

function normalizeLandingPath(value: string) {
  const raw = value.trim() || "/";
  try {
    const parsed = new URL(raw, "https://app.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
