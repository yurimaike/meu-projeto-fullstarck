import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { env } from "../_core/env";
import { DatabaseError } from "../_core/db";
import { protectedRoute } from "../_core/route-helpers";
import { uploadBodyLimit } from "../middlewares/upload-body-limit";
import { StorageError, storageDeleteForUser, storageErrorResponse, storageGetForUser, storagePut } from "../services/s3_storage";
import { distributedRateLimit, identityRateLimitCounter } from "../middlewares/distributed-rate-limit";
import { InvalidImageError, normalizeUploadedImage } from "../services/image-validation";

export const storageRouter = new Hono();
const storageUploadRateLimit = distributedRateLimit((c) => [
  identityRateLimitCounter("storage:upload-minute", c.var.currentUser?.id, 10, 60),
  identityRateLimitCounter("storage:upload-day", c.var.currentUser?.id, 50, 86400)
]);
let activeImageDecodes = 0;

function toErrorResponse(error: unknown) {
  if (error instanceof StorageError || error instanceof DatabaseError) {
    const { status } = storageErrorResponse(error);
    if (status === 400) return { body: apiFailure("INVALID_INPUT", "The requested file operation is invalid"), status };
    if (status === 404) return { body: apiFailure("FILE_NOT_FOUND", "File not found"), status };
    if (status === 413) return { body: apiFailure("PAYLOAD_TOO_LARGE", "The file exceeds the allowed limit"), status };
    if (status === 415) return { body: apiFailure("UNSUPPORTED_FILE_TYPE", "Only valid JPEG, PNG, and WebP images are accepted"), status };
    if (status === 429) return { body: apiFailure("RATE_LIMITED", "Too many file operations. Try again later."), status };
    if (status === 503) return { body: apiFailure("STORAGE_UNAVAILABLE", "File storage is temporarily unavailable"), status };
    return { body: apiFailure("STORAGE_REQUEST_FAILED", "The file operation could not be completed"), status };
  }

  throw error;
}

const uploadHandler = async (c: Context) => {
  const user = c.var.currentUser;

  let body: FormData;
  try {
    body = await c.req.formData();
  } catch {
    return c.json(apiFailure("INVALID_INPUT", "Expected multipart/form-data"), 400);
  }

  const files = body.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File)) {
    return c.json(apiFailure("INVALID_INPUT", "Upload exactly one image file"), 400);
  }

  const file = files[0];
  if (file.size <= 0) {
    return c.json(apiFailure("INVALID_INPUT", "The image file is empty"), 400);
  }
  if (file.size > env.STORAGE_MAX_UPLOAD_BYTES) {
    return c.json(apiFailure("PAYLOAD_TOO_LARGE", "The uploaded file exceeds the allowed size"), 413);
  }

  if (activeImageDecodes >= 1) {
    c.header("Retry-After", "2");
    return c.json(apiFailure("UPLOAD_BUSY", "Upload processing is busy. Try again shortly."), 429);
  }

  activeImageDecodes += 1;
  let normalized: Awaited<ReturnType<typeof normalizeUploadedImage>>;
  try {
    normalized = await normalizeUploadedImage(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    if (error instanceof InvalidImageError) {
      const code = error.status === 413 ? "PAYLOAD_TOO_LARGE" : "UNSUPPORTED_FILE_TYPE";
      return c.json(apiFailure(code, error.message), error.status);
    }
    return c.json(apiFailure("INVALID_IMAGE", "The uploaded image could not be processed"), 415);
  } finally {
    activeImageDecodes -= 1;
  }

  const relKey = `${randomUUID()}.${normalized.extension}`;

  try {
    const storedFile = await storagePut(relKey, normalized.bytes, normalized.contentType, { userId: user.id });
    return c.json(apiSuccess({ file: storedFile }), 200);
  } catch (error) {
    const { body: errorBody, status } = toErrorResponse(error);
    return c.json(errorBody, status);
  }
};

storageRouter.post("", protectedRoute, storageUploadRateLimit, uploadBodyLimit, uploadHandler);
storageRouter.post("/", protectedRoute, storageUploadRateLimit, uploadBodyLimit, uploadHandler);

storageRouter.get("/:id", protectedRoute, async (c) => {
  const user = c.var.currentUser;

  try {
    const file = await storageGetForUser(c.req.param("id"), user.id);
    return c.json(apiSuccess({ file }), 200);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return c.json(body, status);
  }
});

storageRouter.get("/:id/download", protectedRoute, async (c) => {
  const user = c.var.currentUser;

  try {
    const file = await storageGetForUser(c.req.param("id"), user.id);
    if (file.status !== "uploaded") {
      return c.json(apiFailure("STORAGE_FILE_NOT_UPLOADED", "Storage file is not uploaded"), 409);
    }

    return c.redirect(file.downloadUrl, 302);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return c.json(body, status);
  }
});

storageRouter.delete("/:id", protectedRoute, async (c) => {
  const user = c.var.currentUser;

  try {
    const file = await storageDeleteForUser(c.req.param("id"), user.id);
    return c.json(apiSuccess({ file }), 200);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return c.json(body, status);
  }
});
