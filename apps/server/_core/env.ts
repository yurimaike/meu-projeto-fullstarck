const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const DEV_BETTER_AUTH_SECRET = "dev-only-better-auth-secret-change-before-production";

function readEnv(...values: Array<string | undefined>) {
  return values.find((value) => value !== undefined && value.trim() !== "");
}

function readBoundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const cliPort = readCliPort(process.argv);
const configuredBetterAuthSecret = readEnv(process.env.BETTER_AUTH_SECRET);
if (nodeEnv === "production" && !configuredBetterAuthSecret) {
  throw new Error("BETTER_AUTH_SECRET must be configured in production");
}
const betterAuthSecret = configuredBetterAuthSecret ?? DEV_BETTER_AUTH_SECRET;
const configuredAllowedOrigins = readEnv(process.env.ALLOWED_ORIGINS);
if (nodeEnv === "production" && !configuredAllowedOrigins) {
  throw new Error("ALLOWED_ORIGINS must be configured in production");
}
const upstashRestUrl = readEnv(process.env.UPSTASH_REDIS_REST_URL) ?? "";
if (upstashRestUrl) {
  let parsedUpstashUrl: URL;
  try {
    parsedUpstashUrl = new URL(upstashRestUrl);
  } catch {
    throw new Error("UPSTASH_REDIS_REST_URL must be a valid HTTPS URL");
  }
  if (parsedUpstashUrl.protocol !== "https:" || parsedUpstashUrl.username || parsedUpstashUrl.password || parsedUpstashUrl.search || parsedUpstashUrl.hash) {
    throw new Error("UPSTASH_REDIS_REST_URL must be an HTTPS URL without credentials, query, or fragment");
  }
}
const upstashRestToken = readEnv(process.env.UPSTASH_REDIS_REST_TOKEN) ?? "";
if (nodeEnv === "production" && (!upstashRestUrl || !upstashRestToken)) {
  throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured in production");
}
const trustRenderProxy = process.env.RATE_LIMIT_TRUST_RENDER_PROXY === "true";
if (nodeEnv === "production" && !trustRenderProxy) {
  throw new Error("RATE_LIMIT_TRUST_RENDER_PROXY=true is required in production to use Render's forwarded client IP");
}
const storageProvider = readEnv(process.env.STORAGE_PROVIDER) ?? "skywork";
if (storageProvider !== "skywork" && storageProvider !== "r2") {
  throw new Error("STORAGE_PROVIDER must be either skywork or r2");
}
const r2AccountId = readEnv(process.env.R2_ACCOUNT_ID) ?? "";
const r2AccessKeyId = readEnv(process.env.R2_ACCESS_KEY_ID) ?? "";
const r2SecretAccessKey = readEnv(process.env.R2_SECRET_ACCESS_KEY) ?? "";
const r2Bucket = readEnv(process.env.R2_BUCKET) ?? "";
if (storageProvider === "r2" && nodeEnv === "production" && !(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket)) {
  throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be configured when STORAGE_PROVIDER=r2");
}

const authUrl = readEnv(process.env.BETTER_AUTH_URL) ?? "http://localhost:3100/api/auth";
if (nodeEnv === "production") {
  let parsedAuthUrl: URL;
  try {
    parsedAuthUrl = new URL(authUrl);
  } catch {
    throw new Error("BETTER_AUTH_URL must be a valid HTTPS URL in production");
  }
  if (
    parsedAuthUrl.protocol !== "https:" ||
    !parsedAuthUrl.hostname ||
    parsedAuthUrl.username ||
    parsedAuthUrl.password ||
    parsedAuthUrl.search ||
    parsedAuthUrl.hash
  ) {
    throw new Error("BETTER_AUTH_URL must be a valid HTTPS URL in production");
  }
}

function normalizeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.origin === "null" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

const rawAllowedOrigins = (configuredAllowedOrigins ?? "http://localhost:3100,http://127.0.0.1:3100")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const parsedAllowedOrigins = rawAllowedOrigins.map(normalizeOrigin);
if (nodeEnv === "production" && parsedAllowedOrigins.some((origin) => origin === null)) {
  throw new Error("ALLOWED_ORIGINS must contain only valid HTTP(S) origins");
}
const allowedOrigins = Array.from(new Set(parsedAllowedOrigins.filter((origin): origin is string => origin !== null)));
if (nodeEnv === "production" && allowedOrigins.length === 0) {
  throw new Error("ALLOWED_ORIGINS must contain at least one valid origin in production");
}

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(cliPort ?? process.env.PORT ?? 9901),
  // Must match the platform health-check / routed container port (the deploy
  // pipeline registers 3000 and injects SKY_FC_SERVER_PORT; image-mode FC does not
  // set it by itself). A 9901-style mismatch gets the instance killed by the
  // 120s health check and every request answers 412 FunctionNotStarted.
  SKY_FC_SERVER_PORT: Number(readEnv(process.env.SKY_FC_SERVER_PORT, process.env.PORT) ?? 3000),
  ALLOWED_ORIGINS: allowedOrigins,
  BETTER_AUTH_URL: authUrl,
  BETTER_AUTH_SECRET: betterAuthSecret,
  // The backend's own public base URL. The API domain is only assigned at
  // deploy time (different domain from the static client), so it is never a
  // build-time constant — the deploy pipeline injects it here once known.
  // Used by getPublicBaseUrl() (see _core/public-url.ts) to build absolute
  // callback / webhook URLs (e.g. payment providers). Empty until injected.
  PUBLIC_BACKEND_URL: readEnv(process.env.PUBLIC_BACKEND_URL) ?? "",
  // Turso is the preferred self-managed database. Keep the legacy Skybase
  // values temporarily so existing deployments can be rolled back safely.
  TURSO_DATABASE_URL: readEnv(process.env.TURSO_DATABASE_URL) ?? "",
  TURSO_AUTH_TOKEN: readEnv(process.env.TURSO_AUTH_TOKEN) ?? "",
  SKYBASE_DB_ENDPOINT: readEnv(process.env.SKYBASE_DB_ENDPOINT) ?? "",
  SKYBASE_DB_TOKEN: readEnv(process.env.SKYBASE_DB_AUTH_TOKEN, process.env.SKYBASE_DB_TOKEN) ?? "",
  SKYBASE_DB_NAMESPACE: readEnv(process.env.SKYBASE_DB_NAMESPACE) ?? "",
  UPSTASH_REDIS_REST_URL: upstashRestUrl.replace(/\/+$/, ""),
  UPSTASH_REDIS_REST_TOKEN: upstashRestToken,
  RATE_LIMIT_TRUST_RENDER_PROXY: trustRenderProxy,
  PUBLIC_AI_MAX_CALLS_PER_DAY: readBoundedInteger(process.env.PUBLIC_AI_MAX_CALLS_PER_DAY, 50, 1, 10000),
  PUBLIC_AI_REQUESTS_PER_IP_PER_MINUTE: readBoundedInteger(process.env.PUBLIC_AI_REQUESTS_PER_IP_PER_MINUTE, 5, 1, 100),
  SKYWORK_GATEWAY_BASE_URL: readEnv(process.env.SKYWORK_GATEWAY_BASE_URL) ?? "https://api-inn.skywork.ai/gateway",
  SKYWORK_API_TOKEN: readEnv(process.env.SKYWORK_API_TOKEN) ?? "",
  SKYWORK_AI_BASE_URL: readEnv(process.env.SKYWORK_AI_BASE_URL) ?? "https://api.skywork.ai/skycowork-llm/",
  GEMINI_API_KEY: readEnv(process.env.GEMINI_API_KEY) ?? "",
  PUBLIC_AI_MAX_OUTPUT_TOKENS: readBoundedInteger(process.env.PUBLIC_AI_MAX_OUTPUT_TOKENS, 512, 1, 2048),
  PUBLIC_AI_MAX_CONCURRENT_REQUESTS: readBoundedInteger(process.env.PUBLIC_AI_MAX_CONCURRENT_REQUESTS, 2, 1, 10),
  STORAGE_MAX_UPLOAD_BYTES: readBoundedInteger(process.env.STORAGE_MAX_UPLOAD_BYTES, 5 * 1024 * 1024, 1024, 20 * 1024 * 1024),
  STORAGE_PROVIDER: storageProvider,
  STORAGE_MAX_IMAGE_PIXELS: readBoundedInteger(process.env.STORAGE_MAX_IMAGE_PIXELS, 16_000_000, 1_000_000, 36_000_000),
  R2_ACCOUNT_ID: r2AccountId,
  R2_ACCESS_KEY_ID: r2AccessKeyId,
  R2_SECRET_ACCESS_KEY: r2SecretAccessKey,
  R2_BUCKET: r2Bucket,
  BOOKING_ADMIN_EMAILS: (readEnv(process.env.BOOKING_ADMIN_EMAILS) ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
  GOOGLE_CLIENT_ID:
    readEnv(process.env.GOOGLE_CLIENT_ID, process.env.VITE_GOOGLE_CLIENT_ID, viteEnv.VITE_GOOGLE_CLIENT_ID) ?? "",
  GOOGLE_CLIENT_SECRET: readEnv(process.env.GOOGLE_CLIENT_SECRET) ?? "",
  RESEND_API_KEY: readEnv(process.env.RESEND_API_KEY) ?? "",
  EMAIL_FROM: readEnv(process.env.EMAIL_FROM) ?? ""
};

export function getAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  const normalized = normalizeOrigin(origin);
  return normalized && env.ALLOWED_ORIGINS.includes(normalized) ? normalized : null;
}

function readCliPort(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if ((arg === "-p" || arg === "--port") && argv[index + 1]) {
      return argv[index + 1];
    }

    if (arg.startsWith("--port=")) {
      return arg.slice("--port=".length);
    }
  }

  return undefined;
}
