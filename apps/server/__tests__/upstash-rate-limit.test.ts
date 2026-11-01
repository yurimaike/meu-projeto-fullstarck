import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Upstash distributed rate limit adapter", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends all counters through one atomic EVAL and allows an in-limit request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    const { consumeDistributedRateLimits } = await import("../services/upstash-redis");

    const result = await consumeDistributedRateLimits([
      { scope: "booking:create", identity: "ip:203.0.113.4", limit: 5, windowSeconds: 600 },
      { scope: "public-ai:global", identity: "all", limit: 50, windowSeconds: 86400 }
    ], 1_800_000_000_000);

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://redis.example.invalid");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
    const command = JSON.parse(String(init?.body)) as unknown[];
    expect(command[0]).toBe("EVAL");
    expect(command[2]).toBe(2);
    expect(String(command[3])).toMatch(/^leticia:rl:booking:create:/);
    expect(String(command[3])).not.toContain("203.0.113.4");
  });

  it("returns a retry interval when any atomic counter is exhausted", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: 17 })));
    const { consumeDistributedRateLimits } = await import("../services/upstash-redis");
    const result = await consumeDistributedRateLimits([
      { scope: "public-ai:global", identity: "all", limit: 50, windowSeconds: 86400 }
    ]);
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 17 });
  });

  it("fails closed when the Redis REST service returns an error", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "temporary failure" }, { status: 503 })));
    const { consumeDistributedRateLimits, UpstashUnavailableError } = await import("../services/upstash-redis");
    await expect(consumeDistributedRateLimits([
      { scope: "auth:login", identity: "ip:203.0.113.4", limit: 10, windowSeconds: 900 }
    ])).rejects.toBeInstanceOf(UpstashUnavailableError);
  });

  it("stores only hashed guest-email keys and consumes a code atomically", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: "OK" }))
      .mockResolvedValueOnce(Response.json({ result: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const redis = await import("../services/upstash-redis");

    await redis.storeGuestBookingChallenge("client@example.com", "123456");
    const storedCommand = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as unknown[];
    expect(String(storedCommand[1])).not.toContain("client@example.com");
    expect(String(storedCommand[2])).not.toContain("123456");
    expect(storedCommand).toContain("EX");
    await expect(redis.consumeGuestBookingChallenge("client@example.com", "123456")).resolves.toBe(true);
    const consumeCommand = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as unknown[];
    expect(consumeCommand[0]).toBe("EVAL");
    expect(String(consumeCommand[1])).toContain("redis.call('DEL', KEYS[1])");
  });

  it("increments Better Auth secondary-storage counters atomically with a creation-only TTL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const { upstashSecondaryStorage } = await import("../services/upstash-redis");

    await expect(upstashSecondaryStorage.increment("rate-limit:test", 60)).resolves.toBe(2);
    const command = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as unknown[];
    expect(command[0]).toBe("EVAL");
    expect(command[3]).toBe("leticia:ba:rate-limit:test");
    expect(command[4]).toBe(60);
    expect(String(command[1])).toContain("redis.call('INCR', KEYS[1])");
    expect(String(command[1])).toContain("if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end");
  });
});
