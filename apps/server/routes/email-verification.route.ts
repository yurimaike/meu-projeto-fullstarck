import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { executeSql, getDb } from "../_core/db";
import { env } from "../_core/env";
import { protectedRoute } from "../_core/route-helpers";
import { user as userTable, verification } from "../db/schema";
import { sendEmailVerificationCode } from "../services/message";
import { distributedRateLimit, identityRateLimitCounter, ipRateLimitCounter } from "../middlewares/distributed-rate-limit";
import { bodySizeLimit } from "../middlewares/body-size-limit";

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFICATION_PREFIX = "email-verification:";

const VerifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
});

export const emailVerificationRouter = new Hono();
const sendCodeRateLimit = distributedRateLimit((c) => [
  ipRateLimitCounter(c, "email-code:send-ip", 10, 3600),
  identityRateLimitCounter("email-code:send-email", c.var.currentUser?.email, 5, 3600),
  identityRateLimitCounter("email-code:send-cooldown", c.var.currentUser?.email, 1, RESEND_COOLDOWN_SECONDS)
]);
const verifyCodeRateLimit = distributedRateLimit((c) => [
  ipRateLimitCounter(c, "email-code:verify-ip", 10, 3600),
  identityRateLimitCounter("email-code:verify-email", c.var.currentUser?.email, 10, 3600)
]);

function identifierFor(email: string) {
  return `${VERIFICATION_PREFIX}${email.toLowerCase()}`;
}

function generateCode() {
  return String(randomInt(100000, 1000000));
}

function requestLocale(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header("Accept-Language")?.split(",", 1)[0]?.trim() || undefined;
}

type VerificationValue = {
  code?: string;
  codeHash?: string;
  attempts: number;
};

function hashVerificationCode(code: string) {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`email-verification-code:${code}`)
    .digest("hex");
}

function matchesVerificationCode(stored: VerificationValue, candidate: string) {
  if (stored.codeHash) {
    const expected = Buffer.from(stored.codeHash, "hex");
    const actual = Buffer.from(hashVerificationCode(candidate), "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  // Temporary compatibility for codes created before hash-only storage.
  return typeof stored.code === "string" && stored.code === candidate;
}

function encodeVerificationValue(value: VerificationValue) {
  return JSON.stringify(value);
}

function decodeVerificationValue(raw: string): VerificationValue {
  try {
    const parsed = JSON.parse(raw) as Partial<VerificationValue>;
    if (typeof parsed.code === "string" || typeof parsed.codeHash === "string") {
      const attempts = parsed.attempts;
      return {
        ...(typeof parsed.code === "string" ? { code: parsed.code } : {}),
        ...(typeof parsed.codeHash === "string" ? { codeHash: parsed.codeHash } : {}),
        attempts: typeof attempts === "number" && Number.isInteger(attempts) && attempts >= 0 ? attempts : 0
      };
    }
  } catch {
    // Existing verification rows may contain only the raw 6-digit code.
  }

  return { code: raw, attempts: 0 };
}

emailVerificationRouter.post("/send-code", protectedRoute, sendCodeRateLimit, bodySizeLimit, async (c) => {
  const user = c.var.currentUser;

  if (user.emailVerified) {
    return c.json(apiSuccess({ sent: false, alreadyVerified: true }), 200);
  }

  const code = generateCode();
  const now = Date.now();
  const expiresAt = now + CODE_TTL_MINUTES * 60 * 1000;
  const identifier = identifierFor(user.email);
  const existing = (
    await getDb().select().from(verification).where(eq(verification.identifier, identifier)).limit(1)
  )[0];
  const lastSentAt = Number(existing?.createdAt?.getTime() ?? existing?.updatedAt?.getTime() ?? 0);
  const retryAfterSeconds = Math.ceil((lastSentAt + RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000);

  if (retryAfterSeconds > 0) {
    return c.json(
      {
        ...apiFailure("VERIFICATION_EMAIL_RATE_LIMITED", "Please wait before requesting another code"),
        data: { retryAfterSeconds }
      },
      429
    );
  }

  const verificationId = crypto.randomUUID();
  await getDb().delete(verification).where(eq(verification.identifier, identifier));
  await getDb().insert(verification).values({
    id: verificationId,
    identifier,
    value: encodeVerificationValue({ codeHash: hashVerificationCode(code), attempts: 0 }),
    expiresAt: new Date(expiresAt),
    createdAt: new Date(now),
    updatedAt: new Date(now)
  });

  try {
    await sendEmailVerificationCode({
      email: user.email,
      code,
      expiresInMinutes: CODE_TTL_MINUTES,
      siteName: "Website",
      locale: requestLocale(c)
    });
  } catch (error) {
    // Remove only the code created by this request; never delete a newer code.
    await executeSql("DELETE FROM verification WHERE id = ?", [verificationId]);
    throw error;
  }

  return c.json(apiSuccess({ sent: true, expiresInMinutes: CODE_TTL_MINUTES }), 200);
});

emailVerificationRouter.post("/verify-code", protectedRoute, verifyCodeRateLimit, bodySizeLimit, async (c) => {
  const user = c.var.currentUser;

  const parsed = VerifyCodeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_CODE", "Enter the 6-digit verification code"), 400);
  }

  const identifier = identifierFor(user.email);
  const row = (
    await getDb().select().from(verification).where(eq(verification.identifier, identifier)).limit(1)
  )[0];
  if (!row) {
    return c.json(apiFailure("CODE_NOT_FOUND", "Request a new verification code"), 400);
  }

  const stored = decodeVerificationValue(row.value);
  const expiresAt = row.expiresAt.getTime();
  if (Date.now() > expiresAt) {
    await executeSql("DELETE FROM verification WHERE id = ?", [row.id]);
    return c.json(apiFailure("CODE_EXPIRED", "Verification code has expired"), 400);
  }

  if (!matchesVerificationCode(stored, parsed.data.code)) {
    if (stored.codeHash) {
      // New-format values are JSON. Increment attempts inside SQLite so
      // simultaneous wrong guesses cannot overwrite one another's counter.
      await executeSql(
        "UPDATE verification SET value = json_set(value, '$.attempts', COALESCE(CAST(json_extract(value, '$.attempts') AS INTEGER), 0) + 1) WHERE id = ? AND json_valid(value)",
        [row.id]
      );
      const latest = await executeSql("SELECT value FROM verification WHERE id = ?", [row.id]);
      if (latest.rows.length === 0) {
        return c.json(apiFailure("CODE_ATTEMPTS_EXCEEDED", "Request a new verification code"), 429);
      }
      const latestValue = decodeVerificationValue(String(latest.rows[0].value));
      if (latestValue.attempts >= MAX_VERIFY_ATTEMPTS) {
        await executeSql("DELETE FROM verification WHERE id = ?", [row.id]);
        return c.json(apiFailure("CODE_ATTEMPTS_EXCEEDED", "Request a new verification code"), 429);
      }
    } else {
      // Legacy plaintext rows are kept compatible until they expire; use
      // compare-and-swap because their value is not a JSON object.
      const attempts = stored.attempts + 1;
      if (attempts >= MAX_VERIFY_ATTEMPTS) {
        await executeSql("DELETE FROM verification WHERE id = ? AND value = ?", [row.id, row.value]);
        return c.json(apiFailure("CODE_ATTEMPTS_EXCEEDED", "Request a new verification code"), 429);
      }
      const nextValue = encodeVerificationValue({ code: stored.code, attempts });
      const updateResult = await executeSql(
        "UPDATE verification SET value = ? WHERE id = ? AND value = ?",
        [nextValue, row.id, row.value]
      );
      if (updateResult.rowsAffected === 0) {
        return c.json(apiFailure("CODE_INVALID", "Verification code was already checked. Try again."), 409);
      }
    }
    return c.json(apiFailure("CODE_INVALID", "Invalid verification code"), 400);
  }

  // Consume the exact row with a compare-and-delete. Only one concurrent
  // request can claim a valid code; other rows for this identifier are untouched.
  const consumeResult = await executeSql(
    "DELETE FROM verification WHERE id = ? AND value = ? AND expiresAt >= ?",
    [row.id, row.value, Math.floor(Date.now() / 1000)]
  );
  if (consumeResult.rowsAffected === 0) {
    return c.json(apiFailure("CODE_INVALID", "Verification code was already used or expired"), 409);
  }

  await getDb()
    .update(userTable)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(userTable.id, user.id));

  return c.json(apiSuccess({ verified: true }), 200);
});
