import { createHash } from "node:crypto";
import { env } from "../_core/env";

export class UpstashUnavailableError extends Error {
  constructor() {
    super("Distributed request protection is unavailable");
    this.name = "UpstashUnavailableError";
  }
}

type UpstashCommandResult = { result?: unknown; error?: unknown };

export type RateLimitCounter = {
  scope: string;
  identity: string;
  limit: number;
  windowSeconds: number;
};

const consumeCountersScript = `
local retry = 0
for i = 1, #KEYS do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('EXPIRE', KEYS[i], ARGV[(i - 1) * 2 + 2]) end
  if count > tonumber(ARGV[(i - 1) * 2 + 1]) then
    local ttl = redis.call('TTL', KEYS[i])
    if ttl > retry then retry = ttl end
  end
end
return retry
`;

export function isUpstashConfigured() {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

async function command(args: Array<string | number>, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!isUpstashConfigured()) throw new UpstashUnavailableError();
  let response: Response;
  try {
    response = await fetcher(env.UPSTASH_REDIS_REST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(2500)
    });
  } catch {
    throw new UpstashUnavailableError();
  }

  if (!response.ok) throw new UpstashUnavailableError();
  let payload: UpstashCommandResult;
  try {
    payload = (await response.json()) as UpstashCommandResult;
  } catch {
    throw new UpstashUnavailableError();
  }
  if (payload.error !== undefined) throw new UpstashUnavailableError();
  return payload.result;
}

/**
 * Atomically claims a one-time administrative plan approval.
 * Redis SET NX makes the claim shared across backend instances; a successful
 * claim cannot be repeated until the short approval lifetime expires.
 */
export async function claimAdminPlanApproval(nonce: string, ttlSeconds: number): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) {
    throw new Error("Invalid approval nonce");
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 600) {
    throw new Error("Invalid approval TTL");
  }
  const result = await command([
    "SET",
    `leticia:admin-ai:approval-used:${nonce}`,
    "1",
    "NX",
    "EX",
    ttlSeconds
  ]);
  if (result === "OK") return true;
  if (result === null) return false;
  throw new UpstashUnavailableError();
}

export async function consumeDistributedRateLimits(
  counters: RateLimitCounter[],
  now = Date.now()
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (counters.length === 0) return { allowed: true, retryAfterSeconds: 0 };

  const keys = counters.map((counter) => {
    if (!Number.isSafeInteger(counter.limit) || counter.limit < 1 || !Number.isSafeInteger(counter.windowSeconds) || counter.windowSeconds < 1) {
      throw new Error("Invalid rate limit policy");
    }
    const windowIndex = Math.floor(now / (counter.windowSeconds * 1000));
    const identityHash = createHash("sha256").update(counter.identity).digest("hex");
    return `leticia:rl:${counter.scope}:${windowIndex}:${identityHash}`;
  });
  const args: Array<string | number> = ["EVAL", consumeCountersScript, keys.length, ...keys];
  for (const counter of counters) args.push(counter.limit, counter.windowSeconds + 2);

  const result = await command(args);
  const retryAfterSeconds = Number(result);
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) throw new UpstashUnavailableError();
  return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
}

function guestChallengeKey(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const digest = createHash("sha256").update(`${env.BETTER_AUTH_SECRET}:${normalizedEmail}`).digest("hex");
  return `leticia:guest-booking-access:${digest}`;
}

export async function storeGuestBookingChallenge(email: string, code: string, ttlSeconds = 600) {
  const codeHash = createHash("sha256").update(`${env.BETTER_AUTH_SECRET}:${code}`).digest("hex");
  await command(["SET", guestChallengeKey(email), JSON.stringify({ codeHash, attempts: 0 }), "EX", ttlSeconds]);
}

export async function consumeGuestBookingChallenge(email: string, code: string) {
  const codeHash = createHash("sha256").update(`${env.BETTER_AUTH_SECRET}:${code}`).digest("hex");
  const script = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local challenge = cjson.decode(raw)
if challenge.codeHash == ARGV[1] then redis.call('DEL', KEYS[1]); return 1 end
local attempts = tonumber(challenge.attempts or 0) + 1
if attempts >= 5 then redis.call('DEL', KEYS[1]); return 0 end
challenge.attempts = attempts
local ttl = redis.call('TTL', KEYS[1])
if ttl > 0 then redis.call('SET', KEYS[1], cjson.encode(challenge), 'EX', ttl) end
return 0
`;
  return Number(await command(["EVAL", script, 1, guestChallengeKey(email), codeHash])) === 1;
}

export async function deleteGuestBookingChallenge(email: string) {
  await command(["DEL", guestChallengeKey(email)]);
}

export const upstashSecondaryStorage = {
  async get(key: string): Promise<string | null> {
    const value = await command(["GET", `leticia:ba:${key}`]);
    return typeof value === "string" ? value : null;
  },
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl !== undefined && (!Number.isSafeInteger(ttl) || ttl <= 0)) return;
    const args: Array<string | number> = ["SET", `leticia:ba:${key}`, value];
    if (ttl !== undefined) args.push("EX", ttl);
    await command(args);
  },
  async delete(key: string): Promise<void> {
    await command(["DEL", `leticia:ba:${key}`]);
  },
  async getAndDelete(key: string): Promise<string | null> {
    const script = "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value";
    const value = await command(["EVAL", script, 1, `leticia:ba:${key}`]);
    return typeof value === "string" ? value : null;
  },
  async increment(key: string, ttl: number): Promise<number> {
    if (!Number.isSafeInteger(ttl) || ttl <= 0) throw new Error("Invalid secondary storage TTL");
    const script = "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count";
    const value = Number(await command(["EVAL", script, 1, `leticia:ba:${key}`, ttl]));
    if (!Number.isSafeInteger(value) || value < 1) throw new UpstashUnavailableError();
    return value;
  }
};
