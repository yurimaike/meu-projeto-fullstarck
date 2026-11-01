import { createHash, createHmac } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { adminRoute } from "../_core/route-helpers";
import { env } from "../_core/env";
import { bodySizeLimit } from "../middlewares/body-size-limit";
import { distributedRateLimit, identityRateLimitCounter } from "../middlewares/distributed-rate-limit";
import {
  PlatformAIError,
  requestPlatformAIChat,
  requestPlatformAIChatStream,
  requestPlatformAIImage
} from "../services/platform-ai";

const SceneKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,63}$/)
  .refine((sceneKey) => !sceneKey.endsWith("_") && !sceneKey.includes("__"));

const MessageContentSchema = z.union([
  z.string().max(10_000),
  z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string().max(10_000) }),
        z.object({
          type: z.literal("image_url"),
          image_url: z.object({ url: z.string().url() })
        })
      ])
    )
    .min(1)
    .max(20)
]);

const ChatRequestSchema = z.object({
  scene_key: SceneKeySchema,
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: MessageContentSchema
      })
    )
    .min(1)
    .max(50),
  stream: z.boolean().optional().default(false)
});

const ImageRequestSchema = z.object({
  scene_key: SceneKeySchema,
  prompt: z.string().trim().min(1).max(10_000),
  n: z.literal(1).optional().default(1),
  size: z.string().trim().regex(/^\d{2,5}x\d{2,5}$/).optional().default("1024x1024")
});


const EditPlanSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(2000),
  files: z.array(z.object({
    path: z.string().trim().min(1).max(240),
    operation: z.enum(["create", "update", "delete"]),
    reason: z.string().trim().min(1).max(500)
  }).strict()).min(1).max(12),
  risks: z.array(z.string().trim().min(1).max(500)).max(12),
  checks: z.array(z.string().trim().min(1).max(300)).max(12)
}).strict();

function canonicalPlan(plan: z.infer<typeof EditPlanSchema>) {
  return JSON.stringify({
    title: plan.title,
    summary: plan.summary,
    files: [...plan.files].sort((a, b) => a.path.localeCompare(b.path)),
    risks: [...plan.risks].sort(),
    checks: [...plan.checks].sort()
  });
}

function isSafePlanPath(filePath: string) {
  // The editor is limited to frontend source and public assets. Server code,
  // deployment settings, dependency manifests, migrations and hidden files
  // stay outside the AI editor's write boundary.
  if (
    filePath.startsWith("/") ||
    filePath.includes("\\\\") ||
    filePath.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith("."))
  ) return false;

  const allowedRoot = filePath.startsWith("apps/client/src/") || filePath.startsWith("apps/client/public/");
  if (!allowedRoot) return false;

  const lowerPath = filePath.toLowerCase();
  const blocked = [
    ".env", "secret", "credential", "token", "auth", "payment",
    "migration", "database", "drizzle", "package.json", "lock",
    "vite.config", "wrangler", "cloudflare", "render", "worker"
  ];
  return !blocked.some((term) => lowerPath.includes(term));
}

function planDigest(plan: z.infer<typeof EditPlanSchema>) {
  return createHash("sha256").update(canonicalPlan(plan)).digest("hex");
}

function approvalSecret() {
  if (env.NODE_ENV === "production" && env.BETTER_AUTH_SECRET === "dev-only-better-auth-secret-change-before-production") {
    throw new Error("Approval signing secret is not configured");
  }
  return env.BETTER_AUTH_SECRET;
}

function issuePlanApproval(userId: string, digest: string) {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ sub: userId, digest, exp: expiresAt })).toString("base64url");
  const signature = createHmac("sha256", approvalSecret()).update(payload).digest("base64url");
  return { approval_token: payload + "." + signature, expires_at: new Date(expiresAt).toISOString() };
}

export const aiRouter = new Hono();
const aiChatRateLimit = distributedRateLimit((c) => [
  identityRateLimitCounter("admin-ai:chat-minute", c.var.currentUser?.id, 20, 60),
  identityRateLimitCounter("admin-ai:chat-day", c.var.currentUser?.id, 100, 86400)
]);
const aiImageRateLimit = distributedRateLimit((c) => [
  identityRateLimitCounter("admin-ai:image-minute", c.var.currentUser?.id, 3, 60),
  identityRateLimitCounter("admin-ai:image-day", c.var.currentUser?.id, 20, 86400)
]);

function requestBody(c: Context) {
  const body = c.get("rawBody") as Uint8Array | undefined;
  if (!body) return null;
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return null;
  }
}

const chatHandler = async (c: Context) => {
  const parsed = ChatRequestSchema.safeParse(requestBody(c));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Invalid AI chat input"), 400);
  }

  try {
    if (parsed.data.stream) {
      const upstream = await requestPlatformAIChatStream({
        sceneKey: parsed.data.scene_key,
        messages: parsed.data.messages
      });
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream; charset=utf-8",
          "Cache-Control": upstream.headers.get("Cache-Control") ?? "no-cache",
          "X-Accel-Buffering": "no"
        }
      });
    }

    const result = await requestPlatformAIChat({
      sceneKey: parsed.data.scene_key,
      messages: parsed.data.messages
    });
    // TODO: Persist AI interaction and scene_key business metadata after the product layer defines the write policy.
    return c.json(apiSuccess(result), 200);
  } catch (error) {
    if (error instanceof PlatformAIError) {
      return c.json(apiFailure(error.code, error.message), error.status);
    }
    throw error;
  }
};

const imageHandler = async (c: Context) => {
  const parsed = ImageRequestSchema.safeParse(requestBody(c));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Invalid AI image input"), 400);
  }

  try {
    const result = await requestPlatformAIImage({
      sceneKey: parsed.data.scene_key,
      prompt: parsed.data.prompt,
      n: parsed.data.n,
      size: parsed.data.size
    });
    return c.json(apiSuccess(result), 200);
  } catch (error) {
    if (error instanceof PlatformAIError) {
      return c.json(apiFailure(error.code, error.message), error.status);
    }
    throw error;
  }
};


const planPreviewHandler = async (c: Context) => {
  const parsed = EditPlanSchema.safeParse(requestBody(c));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Invalid edit plan"), 400);
  const paths = parsed.data.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) {
    return c.json(apiFailure("INVALID_INPUT", "Duplicate file paths are not allowed"), 400);
  }
  if (paths.some((filePath) => !isSafePlanPath(filePath))) {
    return c.json(apiFailure("UNSAFE_FILE_PATH", "The plan includes a path outside the permitted frontend editing area"), 400);
  }
  return c.json(apiSuccess({ plan: parsed.data, plan_hash: planDigest(parsed.data), approval_required: true }), 200);
};

const planApprovalHandler = async (c: Context) => {
  const parsed = z.object({
    plan: EditPlanSchema,
    plan_hash: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict().safeParse(requestBody(c));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Invalid approval request"), 400);
  if (planDigest(parsed.data.plan) !== parsed.data.plan_hash) {
    return c.json(apiFailure("PLAN_CHANGED", "The plan changed; review it again before approving"), 409);
  }
  try {
    return c.json(apiSuccess(issuePlanApproval(c.var.currentUser.id, parsed.data.plan_hash)), 200);
  } catch {
    return c.json(apiFailure("APPROVAL_UNAVAILABLE", "Secure approval signing is not configured"), 503);
  }
};

const executePlanHandler = async (c: Context) => {
  return c.json(apiFailure("EDITOR_NOT_CONFIGURED", "GitHub execution is disabled until a dedicated server-side GitHub integration is configured and tested"), 503);
};

aiRouter.post("/plans/preview", adminRoute, bodySizeLimit, planPreviewHandler);
aiRouter.post("/plans/approve", adminRoute, bodySizeLimit, planApprovalHandler);
aiRouter.post("/plans/execute", adminRoute, bodySizeLimit, executePlanHandler);
aiRouter.post("", adminRoute, aiChatRateLimit, bodySizeLimit, chatHandler);
aiRouter.post("/", adminRoute, aiChatRateLimit, bodySizeLimit, chatHandler);
aiRouter.post("/images", adminRoute, aiImageRateLimit, bodySizeLimit, imageHandler);
aiRouter.post("/images/", adminRoute, aiImageRateLimit, bodySizeLimit, imageHandler);

