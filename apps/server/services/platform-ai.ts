import { env } from "../_core/env";

const GEMINI_MODEL = "gemini-3.8-flash";
const REQUEST_TIMEOUT_MS = 60_000;

export type PlatformAIMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export type PlatformAIChatInput = {
  sceneKey: string;
  messages: PlatformAIMessage[];
  maxOutputTokens?: number;
};

export type PlatformAIImageInput = {
  sceneKey: string;
  prompt: string;
  n?: 1;
  size?: string;
};

export type PlatformAIErrorCode =
  | "PLATFORM_AI_NOT_CONFIGURED"
  | "PLATFORM_AI_UPSTREAM_ERROR"
  | "PLATFORM_AI_REQUEST_FAILED"
  | "PLATFORM_AI_INVALID_RESPONSE"
  | "PLATFORM_AI_IMAGE_UNSUPPORTED";

export class PlatformAIError extends Error {
  constructor(
    readonly code: PlatformAIErrorCode,
    message: string,
    readonly status: 500 | 502
  ) {
    super(message);
    this.name = "PlatformAIError";
  }
}

type GeminiPart = { text: string } | { fileData: { mimeType: string; fileUri: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function messageText(content: PlatformAIMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.map((part) => part.type === "text" ? part.text : "[Imagem anexada]").join("\n");
}

function toGeminiRequest(input: PlatformAIChatInput) {
  const systemMessages = input.messages.filter((message) => message.role === "system");
  const conversation = input.messages.filter((message) => message.role !== "system");
  const contents: GeminiContent[] = conversation.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: messageText(message.content) }]
  }));

  return {
    ...(systemMessages.length
      ? { systemInstruction: { parts: [{ text: systemMessages.map((message) => messageText(message.content)).join("\n\n") }] } }
      : {}),
    contents,
    generationConfig: { maxOutputTokens: input.maxOutputTokens ?? 2048, temperature: 0.7 }
  };
}

function geminiUrl(stream: boolean) {
  if (!env.GEMINI_API_KEY) {
    throw new PlatformAIError("PLATFORM_AI_NOT_CONFIGURED", "Configure GEMINI_API_KEY no ambiente do servidor.", 500);
  }
  const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:${action}&key=${encodeURIComponent(env.GEMINI_API_KEY)}`.replace(":generateContent&", ":generateContent?");
}

async function requestGemini(input: PlatformAIChatInput, stream: boolean) {
  // Resolve configuration before the network try/catch so a missing API key
  // is reported as NOT_CONFIGURED rather than a misleading connection failure.
  const url = geminiUrl(stream);
  let response: Response;
  const requestStartedAt = performance.now();
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toGeminiRequest(input)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[PlatformAI] Gemini network request failed", {
      model: GEMINI_MODEL,
      stream,
      errorName: error instanceof Error ? error.name : "UnknownError",
      detail: detail.slice(0, 1000)
    });
    throw new PlatformAIError(
      "PLATFORM_AI_REQUEST_FAILED",
      error instanceof Error && error.name === "TimeoutError"
        ? "A conexão com o Gemini excedeu o tempo limite. Tente novamente."
        : "O servidor não conseguiu alcançar a API do Gemini. Confira os Logs do Render.",
      502
    );
  }

  console.info("[PlatformAI] Gemini response headers", {
    model: GEMINI_MODEL,
    stream,
    status: response.status,
    responseMs: Math.round(performance.now() - requestStartedAt),
    messageCount: input.messages.filter((message) => message.role !== "system").length,
    inputChars: input.messages.reduce((sum, message) => {
      const content = messageText(message.content);
      return sum + content.length;
    }, 0)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Keep the provider response in server logs for diagnosis, but never log the
    // request URL because it contains the private API key.
    console.error("[PlatformAI] Gemini request failed", {
      status: response.status,
      model: GEMINI_MODEL,
      stream,
      detail: detail.slice(0, 2000)
    });
    const isInvalidKey = detail.includes("API_KEY_INVALID");
    const message = isInvalidKey
      ? "A chave GEMINI_API_KEY foi rejeitada pelo Google. Confira a variável no Render."
      : response.status === 404
        ? "O Google não encontrou o modelo Gemini configurado. Confira o nome do modelo."
        : response.status === 429
          ? "O limite ou a cota da API Gemini foi atingido. Confira o uso no Google AI Studio."
          : response.status === 403
            ? "O Google negou o acesso à API Gemini. Confira as permissões e o faturamento do projeto."
            : "O Gemini recusou a solicitação. Consulte os Logs do Render para ver o código e o motivo.";
    throw new PlatformAIError("PLATFORM_AI_UPSTREAM_ERROR", message, 502);
  }
  return response;
}

export async function requestPlatformAIChat(input: PlatformAIChatInput) {
  const requestStartedAt = performance.now();
  const response = await requestGemini(input, false);
  let data: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  try {
    data = await response.json() as typeof data;
  } catch {
    throw new PlatformAIError("PLATFORM_AI_INVALID_RESPONSE", "A resposta do Gemini é inválida.", 502);
  }
  const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  console.info("[PlatformAI] Gemini non-stream completed", {
    model: GEMINI_MODEL,
    totalMs: Math.round(performance.now() - requestStartedAt),
    outputChars: reply.length
  });
  return { reply };
}

export async function requestPlatformAIChatStream(input: PlatformAIChatInput) {
  const requestStartedAt = performance.now();
  const upstream = await requestGemini(input, true);
  const upstreamHeadersMs = Math.round(performance.now() - requestStartedAt);
  if (!upstream.body) {
    throw new PlatformAIError("PLATFORM_AI_INVALID_RESPONSE", "O Gemini não retornou um fluxo de resposta.", 502);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let firstByteMs: number | null = null;
      let firstTextMs: number | null = null;
      let outputChars = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (value?.byteLength && firstByteMs === null) {
            firstByteMs = Math.round(performance.now() - requestStartedAt);
          }
          buffer += decoder.decode(value, { stream: !done });
          let boundary = buffer.match(/\r?\n\r?\n/);
          while (boundary?.index !== undefined) {
            const event = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            const data = event.split(/\r?\n/).find((line) => line.startsWith("data:"))?.slice(5).trim();
            if (data) {
              try {
                const parsed = JSON.parse(data) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
                const content = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
                if (content) {
                  if (firstTextMs === null) {
                    firstTextMs = Math.round(performance.now() - requestStartedAt);
                  }
                  outputChars += content.length;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
                }
              } catch { /* Ignore incomplete or non-content Gemini events. */ }
            }
            boundary = buffer.match(/\r?\n\r?\n/);
          }
          if (done) break;
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[PlatformAI] Gemini stream interrupted", {
          model: GEMINI_MODEL,
          errorName: error instanceof Error ? error.name : "UnknownError",
          detail: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
        });
        controller.error(error);
      } finally {
        console.info("[PlatformAI] Gemini stream timing", {
          model: GEMINI_MODEL,
          upstreamHeadersMs,
          firstByteMs,
          firstTextMs,
          totalMs: Math.round(performance.now() - requestStartedAt),
          outputChars
        });
        reader.releaseLock();
      }
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" } });
}

export async function requestPlatformAIImage(_input: PlatformAIImageInput) {
  throw new PlatformAIError("PLATFORM_AI_IMAGE_UNSUPPORTED", "A geração de imagens não está configurada para o Gemini neste projeto.", 502);
}
