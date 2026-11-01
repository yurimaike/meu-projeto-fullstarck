import type { MiddlewareHandler } from "hono";
import { apiFailure } from "@repo/shared/http";
import { env } from "../_core/env";

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const uploadBodyLimit: MiddlewareHandler = async (c, next) => {
  const maxBodyBytes = env.STORAGE_MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES;
  const contentLength = c.req.header("content-length");
  if (contentLength !== undefined) {
    const size = Number(contentLength);
    if (!Number.isSafeInteger(size) || size < 0) {
      return c.json(apiFailure("INVALID_CONTENT_LENGTH", "Invalid request size"), 400);
    }
    if (size > maxBodyBytes) {
      return c.json(apiFailure("PAYLOAD_TOO_LARGE", "The uploaded file exceeds the allowed size"), 413);
    }
  }

  const originalRequest = c.req.raw;
  const reader = originalRequest.body?.getReader();
  if (!reader) {
    return c.json(apiFailure("INVALID_INPUT", "An image file is required"), 400);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBodyBytes) {
        await reader.cancel();
        return c.json(apiFailure("PAYLOAD_TOO_LARGE", "The uploaded file exceeds the allowed size"), 413);
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return c.json(apiFailure("BAD_REQUEST", "The uploaded request could not be read"), 400);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  c.req.raw = new Request(originalRequest.url, {
    method: originalRequest.method,
    headers: originalRequest.headers,
    body: bytes
  });
  await next();
};
