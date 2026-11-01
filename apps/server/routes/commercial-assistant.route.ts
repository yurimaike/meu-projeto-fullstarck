import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { env } from "../_core/env";
import { publicRoute } from "../_core/route-helpers";
import { PlatformAIError, requestPlatformAIChat, type PlatformAIMessage } from "../services/platform-ai";
import { bodySizeLimit } from "../middlewares/body-size-limit";
import { distributedRateLimit, ipRateLimitCounter } from "../middlewares/distributed-rate-limit";

const ALLOWED_SCENE_KEYS = ["commercial_chat"];
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOTAL_CHARS = 10000;

const COMMERCIAL_SYSTEM_PROMPT = `Você é Letícia Comercial, assistente de atendimento do salão Letícia Nail Designer em Nova Tramandaí, RS.

Seu objetivo é acolher visitantes, apresentar os serviços do salão, esclarecer dúvidas e incentivar o agendamento de forma educada, acolhedora e profissional — sem pressionar.

REGRAS OBRIGATÓRIAS:
- Responda SEMPRE em português do Brasil.
- Seja acolhedora, educada, clara e objetiva.
- Não invente preços, promoções, horários, avaliações, fotos ou resultados que não estejam listados abaixo.
- Quando faltar informação, faça uma pergunta objetiva e educada para obter o dado necessário.
- Nunca responda "não entendi". Se não souber, ofereça encaminhar para a Letícia pelo WhatsApp.
- Não solicite senhas, tokens ou informações secretas.
- Não afirme que alterou arquivos, preços, reservas ou configurações do site.
- Quando o cliente quiser agendar, oriente a usar a página /agenda ou o WhatsApp.
- Se o cliente estiver indeciso, ajude a escolher com base nas necessidades descritas.
- Mantenha o tom feminino, elegante e sofisticado.

SERVIÇOS CADASTRADOS:
- Manicure e pedicure: Cuidado tradicional para mãos e pés, com acabamento limpo e delicado. (Cutilagem, formato, esmaltação e finalização para um resultado clássico.)
- Esmaltação em gel: Brilho intenso e durabilidade para manter as unhas bonitas por mais tempo. (Uma camada uniforme, resistente e com acabamento de salão.)
- Banho de gel: Estrutura e proteção para unhas naturais com visual leve e sofisticado. (Ideal para quem busca resistência sem perder a naturalidade.)
- Manutenção: Aquele cuidado de continuidade para preservar o formato e o acabamento. (Avaliamos o crescimento e renovamos o que for preciso.)

INFORMAÇÕES DO SALÃO:
- Atendimento: de 08h às 19h
- Local: Nova Tramandaí · RS
- WhatsApp: (51) 99890-1388
- E-mail: leticiacaio.borges30@gmail.com
- Instagram: @naildesigner.lleticia

HORÁRIOS DISPONÍVEIS (referência):
08:00, 09:30, 11:00, 13:00, 14:30, 16:00, 17:30, 19:00`;

const SceneKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,63}$/)
  .refine((key) => ALLOWED_SCENE_KEYS.includes(key), {
    message: "Cena não permitida para acesso público"
  });

const MessageContentSchema = z.union([
  z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) }),
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
        role: z.enum(["user", "assistant"]),
        content: MessageContentSchema
      })
    )
    .min(1)
    .max(50),
  stream: z.boolean().optional().default(false)
});

export const isPublic = true;

export const commercialAssistantRouter = new Hono();
const publicAIRateLimit = distributedRateLimit((c) => [
  ipRateLimitCounter(c, "public-ai:minute", env.PUBLIC_AI_REQUESTS_PER_IP_PER_MINUTE, 60),
  ipRateLimitCounter(c, "public-ai:day", 30, 86400),
  { scope: "public-ai:global-day", identity: "all", limit: env.PUBLIC_AI_MAX_CALLS_PER_DAY, windowSeconds: 86400 }
]);

let activeRequests = 0;
const publicAIConcurrencyLimit: MiddlewareHandler = async (c, next) => {
  if (activeRequests >= env.PUBLIC_AI_MAX_CONCURRENT_REQUESTS) {
    c.header("Retry-After", "2");
    return c.json(apiFailure("AI_BUSY", "O assistente está ocupado. Tente novamente em instantes."), 429);
  }

  activeRequests += 1;
  try {
    await next();
  } finally {
    activeRequests -= 1;
  }
};

type CommercialMessage = {
  role: "user" | "assistant";
  content: PlatformAIMessage["content"];
};

type JsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; code: "BAD_REQUEST" | "INVALID_JSON"; message: string };

function buildMessages(clientMessages: CommercialMessage[]): PlatformAIMessage[] {
  const totalChars = clientMessages.reduce(
    (sum, m) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length),
    0
  );
  if (totalChars > MAX_TOTAL_CHARS) {
    throw new Error("Mensagens excedem o limite permitido");
  }

  return [
    { role: "system" as const, content: COMMERCIAL_SYSTEM_PROMPT },
    ...clientMessages
  ];
}

async function parseJsonBody(c: Context): Promise<JsonBodyResult> {
  const rawBody = c.get("rawBody") as Uint8Array | undefined;
  if (!rawBody) {
    return { ok: false, code: "BAD_REQUEST", message: "Corpo da requisição não disponível" };
  }

  const text = new TextDecoder().decode(rawBody);
  if (!text.trim()) {
    return { ok: false, code: "BAD_REQUEST", message: "Corpo da requisição vazio" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "INVALID_JSON", message: "Corpo da requisição não é um JSON válido" };
  }

  return { ok: true, data: parsed };
}

commercialAssistantRouter.post("", publicRoute, publicAIRateLimit, publicAIConcurrencyLimit, bodySizeLimit, async (c: Context) => {
  const bodyResult = await parseJsonBody(c);
  if (!bodyResult.ok) {
    return c.json(apiFailure(bodyResult.code, bodyResult.message), 400);
  }

  const parsed = ChatRequestSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Entrada inválida para o assistente comercial"), 400);
  }

  try {
    const messages = buildMessages(parsed.data.messages);
    const result = await requestPlatformAIChat({
      sceneKey: parsed.data.scene_key,
      messages,
      maxOutputTokens: env.PUBLIC_AI_MAX_OUTPUT_TOKENS
    });
    return c.json(apiSuccess(result), 200);
  } catch (error) {
    if (error instanceof PlatformAIError) {
      return c.json(apiFailure(error.code, error.message), error.status);
    }
    return c.json(apiFailure("AI_REQUEST_FAILED", "Erro ao processar a solicitação"), 502);
  }
});

commercialAssistantRouter.post("/", publicRoute, publicAIRateLimit, publicAIConcurrencyLimit, bodySizeLimit, async (c: Context) => {
  const bodyResult = await parseJsonBody(c);
  if (!bodyResult.ok) {
    return c.json(apiFailure(bodyResult.code, bodyResult.message), 400);
  }

  const parsed = ChatRequestSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_INPUT", "Entrada inválida para o assistente comercial"), 400);
  }

  try {
    const messages = buildMessages(parsed.data.messages);
    const result = await requestPlatformAIChat({
      sceneKey: parsed.data.scene_key,
      messages,
      maxOutputTokens: env.PUBLIC_AI_MAX_OUTPUT_TOKENS
    });
    return c.json(apiSuccess(result), 200);
  } catch (error) {
    if (error instanceof PlatformAIError) {
      return c.json(apiFailure(error.code, error.message), error.status);
    }
    return c.json(apiFailure("AI_REQUEST_FAILED", "Erro ao processar a solicitação"), 502);
  }
});
