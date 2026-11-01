import { isIP } from "node:net";
import type { Context, MiddlewareHandler } from "hono";
import { apiFailure } from "@repo/shared/http";
import { env } from "../_core/env";
import { consumeDistributedRateLimits, type RateLimitCounter, UpstashUnavailableError } from "../services/upstash-redis";

function clientIp(c: Context): string | null {
  if (env.RATE_LIMIT_TRUST_RENDER_PROXY) {
    const firstForwardedIp = c.req.header("x-forwarded-for")?.split(",", 1)[0]?.trim();
    if (firstForwardedIp && isIP(firstForwardedIp)) return firstForwardedIp;
    return null;
  }

  return env.NODE_ENV === "production" ? null : "local-development";
}

export function trustedClientIp(c: Context) {
  return clientIp(c);
}

export function distributedRateLimit(
  counters: (c: Context) => RateLimitCounter[]
): MiddlewareHandler {
  return async (c, next) => {
    try {
      const policy = counters(c);
      if (policy.some((counter) => counter.identity === "client-ip:unavailable")) {
        return c.json(apiFailure("RATE_LIMIT_UNAVAILABLE", "Proteção temporariamente indisponível. Tente novamente."), 503);
      }
      const result = await consumeDistributedRateLimits(policy);
      if (!result.allowed) {
        const retryAfter = Math.max(1, result.retryAfterSeconds);
        c.header("Retry-After", String(retryAfter));
        return c.json(apiFailure("RATE_LIMITED", "Muitas solicitações. Aguarde e tente novamente."), 429);
      }
    } catch (error) {
      if (error instanceof UpstashUnavailableError && env.NODE_ENV !== "production") {
        await next();
        return;
      }
      return c.json(apiFailure("RATE_LIMIT_UNAVAILABLE", "Proteção temporariamente indisponível. Tente novamente."), 503);
    }

    await next();
  };
}

export function ipRateLimitCounter(c: Context, scope: string, limit: number, windowSeconds: number): RateLimitCounter {
  const ip = clientIp(c);
  return {
    scope,
    identity: ip ? `ip:${ip}` : "client-ip:unavailable",
    limit,
    windowSeconds
  };
}

export function identityRateLimitCounter(
  scope: string,
  identity: string | undefined,
  limit: number,
  windowSeconds: number
): RateLimitCounter {
  return { scope, identity: identity ? `actor:${identity.toLowerCase()}` : "actor:unavailable", limit, windowSeconds };
}
