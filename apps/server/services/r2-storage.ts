import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { DatabaseError, findStorageFileById, findStorageFileByIdForUser, findStorageFileByPath, insertStorageFile, updateStorageFile } from "../_core/db";
import { env } from "../_core/env";
import { StorageError } from "./storage-errors";

const SIGNED_DOWNLOAD_SECONDS = 300;
let client: S3Client | null = null;

function getR2() {
  if (!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET)) {
    throw new StorageError("STORAGE_CONFIG_MISSING", "R2 storage configuration is incomplete", 503);
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    maxAttempts: 1
  });
  return client;
}

function parseR2Uri(uri: string) {
  const match = /^r2:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match || match[1] !== env.R2_BUCKET || match[2].includes("..") || match[2].startsWith("/")) {
    throw new StorageError("STORAGE_OBJECT_INVALID", "Stored object reference is invalid", 400);
  }
  return match[2];
}

function safeSuffix(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  throw new StorageError("STORAGE_TYPE_UNSUPPORTED", "Only JPEG, PNG, and WebP images are supported", 415);
}

async function signedUrl(key: string, expiresSeconds = SIGNED_DOWNLOAD_SECONDS) {
  if (!Number.isSafeInteger(expiresSeconds) || expiresSeconds < 1 || expiresSeconds > 3600) {
    throw new StorageError("STORAGE_EXPIRES_SECONDS_INVALID", "Storage URL expiry is invalid", 400);
  }
  return getSignedUrl(getR2(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), { expiresIn: expiresSeconds });
}

function storedFile(row: NonNullable<Awaited<ReturnType<typeof findStorageFileById>>>, downloadUrl: string) {
  return {
    id: row.id,
    key: row.objectKey,
    path: row.path,
    url: downloadUrl,
    downloadUrl,
    userId: row.userId,
    fileName: row.fileName,
    fileSuffix: row.fileSuffix,
    contentType: row.contentType,
    fileSize: row.fileSize,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function viewRow(row: NonNullable<Awaited<ReturnType<typeof findStorageFileById>>>) {
  const url = row.status === "uploaded" ? await signedUrl(parseR2Uri(row.downloadUrl)) : "";
  return storedFile(row, url);
}

export async function storagePutR2(
  _relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
  options: { userId?: string | null } = {}
) {
  const suffix = safeSuffix(contentType);
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  if (bytes.byteLength <= 0) throw new StorageError("STORAGE_FILE_EMPTY", "File content is empty", 400);
  if (bytes.byteLength > env.STORAGE_MAX_UPLOAD_BYTES) throw new StorageError("STORAGE_FILE_TOO_LARGE", "File exceeds the configured limit", 413);

  const key = `${randomUUID()}.${suffix}`;
  const uri = `r2://${env.R2_BUCKET}/${key}`;
  const pending = await insertStorageFile({
    userId: options.userId ?? null,
    gatewayFileId: null,
    fileName: key,
    fileSuffix: suffix,
    contentType,
    fileSize: bytes.byteLength,
    objectKey: key,
    path: key,
    downloadUrl: uri,
    status: "pending"
  });

  try {
    await getR2().send(new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "private, no-store",
      Metadata: { fileId: pending.id }
    }), { abortSignal: AbortSignal.timeout(15_000) });
    const row = await updateStorageFile(pending.id, { status: "uploaded", errorMessage: null, updatedAt: new Date().toISOString() });
    return await viewRow(row);
  } catch {
    await updateStorageFile(pending.id, { status: "failed", errorMessage: "R2 upload failed", updatedAt: new Date().toISOString() }).catch(() => undefined);
    throw new StorageError("STORAGE_UPLOAD_FAILED", "The file could not be stored", 503);
  }
}

export async function storageGetR2(id: string) {
  const row = await findStorageFileById(id);
  if (!row) throw new StorageError("STORAGE_FILE_NOT_FOUND", "Storage file not found", 404);
  return viewRow(row);
}

export async function storageGetForUserR2(id: string, userId: string) {
  const row = await findStorageFileByIdForUser(id, userId);
  if (!row) throw new StorageError("STORAGE_FILE_NOT_FOUND", "Storage file not found", 404);
  return viewRow(row);
}

export async function storageDeleteForUserR2(id: string, userId: string) {
  const row = await findStorageFileByIdForUser(id, userId);
  if (!row) throw new StorageError("STORAGE_FILE_NOT_FOUND", "Storage file not found", 404);
  if (row.status === "deleted") return viewRow(row);
  try {
    await getR2().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: parseR2Uri(row.downloadUrl) }), { abortSignal: AbortSignal.timeout(15_000) });
    const deleted = await updateStorageFile(id, { status: "deleted", errorMessage: null, updatedAt: new Date().toISOString() });
    return storedFile(deleted, "");
  } catch {
    throw new StorageError("STORAGE_DELETE_FAILED", "The file could not be deleted", 503);
  }
}

export async function storageGetByPathR2(path: string) {
  const row = await findStorageFileByPath(path);
  if (!row) throw new StorageError("STORAGE_FILE_NOT_FOUND", "Storage file not found", 404);
  return viewRow(row);
}

export async function storageSignDownloadUrlR2(uri: string, expiresSeconds: number) {
  const key = parseR2Uri(uri);
  const url = await signedUrl(key, expiresSeconds);
  return { objectKey: key, sourceUrl: uri, expiredUrl: url, expiresSeconds };
}

export async function storageGetDownloadUrlR2(id: string) {
  return (await storageGetR2(id)).downloadUrl;
}

export function mapR2Error(error: unknown): never {
  if (error instanceof StorageError || error instanceof DatabaseError) throw error;
  throw new StorageError("STORAGE_REQUEST_FAILED", "The file operation could not be completed", 503);
}
