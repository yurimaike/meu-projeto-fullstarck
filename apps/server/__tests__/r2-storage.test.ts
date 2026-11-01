import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findForUser: vi.fn(), insert: vi.fn(), update: vi.fn() }));
const s3 = vi.hoisted(() => ({ send: vi.fn() }));
const presigner = vi.hoisted(() => ({ sign: vi.fn() }));

vi.mock("../_core/db", () => ({
  DatabaseError: class DatabaseError extends Error {},
  findStorageFileById: vi.fn(),
  findStorageFileByIdForUser: db.findForUser,
  findStorageFileByPath: vi.fn(),
  insertStorageFile: db.insert,
  updateStorageFile: db.update
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send(...args: unknown[]) { return s3.send(...args); } },
  DeleteObjectCommand: class { constructor(readonly input: unknown) {} },
  GetObjectCommand: class { constructor(readonly input: unknown) {} },
  PutObjectCommand: class { constructor(readonly input: unknown) {} }
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: presigner.sign }));

describe("R2 storage adapter", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("R2_ACCOUNT_ID", "account-test");
    vi.stubEnv("R2_ACCESS_KEY_ID", "access-test");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret-test");
    vi.stubEnv("R2_BUCKET", "leticia-private-test");
    vi.resetModules();
    vi.clearAllMocks();
    s3.send.mockResolvedValue({});
    presigner.sign.mockResolvedValue("https://r2.example.invalid/signed-object");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("stores only a server-generated image key and returns a short-lived signed URL", async () => {
    const now = new Date().toISOString();
    db.insert.mockResolvedValue({ id: "file-1", userId: "user-1", fileName: "generated.webp", fileSuffix: "webp", contentType: "image/webp", fileSize: 3, objectKey: "generated.webp", path: "generated.webp", downloadUrl: "r2://leticia-private-test/generated.webp", status: "pending", createdAt: now, updatedAt: now });
    db.update.mockResolvedValue({ id: "file-1", userId: "user-1", fileName: "generated.webp", fileSuffix: "webp", contentType: "image/webp", fileSize: 3, objectKey: "generated.webp", path: "generated.webp", downloadUrl: "r2://leticia-private-test/generated.webp", status: "uploaded", createdAt: now, updatedAt: now });
    const { storagePutR2 } = await import("../services/r2-storage");

    const file = await storagePutR2("../../unsafe/path.webp", Uint8Array.from([1, 2, 3]), "image/webp", { userId: "user-1" });

    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", fileSuffix: "webp", contentType: "image/webp" }));
    expect(String(db.insert.mock.calls[0]?.[0].objectKey)).toMatch(/^[0-9a-f-]{36}\.webp$/i);
    expect(String(db.insert.mock.calls[0]?.[0].objectKey)).not.toContain("unsafe");
    expect(s3.send).toHaveBeenCalledTimes(1);
    expect(file.downloadUrl).toBe("https://r2.example.invalid/signed-object");
    expect(file.downloadUrl).not.toContain("secret-test");
    expect(presigner.sign.mock.calls[0]?.[2]).toEqual({ expiresIn: 300 });
  });

  it("does not delete an object when the requesting user does not own its metadata", async () => {
    db.findForUser.mockResolvedValue(undefined);
    const { storageDeleteForUserR2 } = await import("../services/r2-storage");

    await expect(storageDeleteForUserR2("file-2", "user-1")).rejects.toMatchObject({ status: 404 });
    expect(s3.send).not.toHaveBeenCalled();
  });

  it("rejects invalid object references before signing", async () => {
    const { storageSignDownloadUrlR2 } = await import("../services/r2-storage");

    await expect(storageSignDownloadUrlR2("r2://other-bucket/private.png", 300)).rejects.toMatchObject({ status: 400 });
    expect(presigner.sign).not.toHaveBeenCalled();
  });
});
