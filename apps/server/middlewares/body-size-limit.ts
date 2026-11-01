import type { Context, MiddlewareHandler } from "hono";
import { apiFailure } from "@repo/shared/http";

const MAX_BODY_BYTES = 50_000;

export const bodySizeLimit: MiddlewareHandler = async (c, next) => {
  // 1. Verificar Content-Length antes de ler qualquer byte do corpo
  const contentLength = c.req.header("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > MAX_BODY_BYTES) {
      return c.json(
        apiFailure("PAYLOAD_TOO_LARGE", "Corpo da requisição excede o limite de 50.000 bytes"),
        413
      );
    }
  }

  // 2. Se não há Content-Length ou é menor que o limite, ler stream com controle
  const body = c.req.raw.body;
  if (!body) {
    return next();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          // 3. Cancelar leitura excedente imediatamente
          await reader.cancel();
          return c.json(
            apiFailure("PAYLOAD_TOO_LARGE", "Corpo da requisição excede o limite de 50.000 bytes"),
            413
          );
        }
        chunks.push(value);
      }
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // Ignorar erro de cancelamento
    }
    return c.json(
      apiFailure("BAD_REQUEST", "Corpo da requisição malformado"),
      400
    );
  }

  // 4. Concatenação eficiente dos chunks
  const allBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    allBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // 5. Armazenar corpo lido no contexto para o handler usar sem reler o stream
  c.set("rawBody", allBytes);
  return next();
};

export { MAX_BODY_BYTES };
