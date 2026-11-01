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
  let response: Response;
  try {
    response = await fetch(geminiUrl(stream), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toGeminiRequest(input)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw new PlatformAIError("PLATFORM_AI_REQUEST_FAILED", "Falha ao conectar ao Gemini.", 502);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new PlatformAIError(
      "PLATFORM_AI_UPSTREAM_ERROR",
      detail.includes("API_KEY_INVALID") ? "A chave GEMINI_API_KEY é inválida." : "O Gemini está temporariamente indisponível. Verifique a chave e a cota da API.",
      502
    );
  }
  return response;
}

export async function requestPlatformAIChat(input: PlatformAIChatInput) {
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
  return { reply };
}

export async function requestPlatformAIChatStream(input: PlatformAIChatInput) {
  const upstream = await requestGemini(input, true);
  if (!upstream.body) {
    throw new PlatformAIError("PLATFORM_AI_INVALID_RESPONSE", "O Gemini não retornou um fluxo de resposta.", 502);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
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
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" } });
}

export async function requestPlatformAIImage(_input: PlatformAIImageInput) {
  throw new PlatformAIError("PLATFORM_AI_IMAGE_UNSUPPORTED", "A geração de imagens não está configurada para o Gemini neste projeto.", 502);
}
