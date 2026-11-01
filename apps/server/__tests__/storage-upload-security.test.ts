import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AuthUser } from "../_core/auth";
import { executeSql } from "../_core/db";
import { storageRouter } from "../routes/storage.route";
import { env } from "../_core/env";
import sharp from "sharp";

vi.mock("../services/s3_storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/s3_storage")>();
  return { ...actual, storagePut: vi.fn() };
});

import { storagePut } from "../services/s3_storage";

const storeFile = storagePut as ReturnType<typeof vi.fn>;
const user: AuthUser = {
  id: "user-1",
  name: "Upload Test",
  email: "upload@example.com",
  emailVerified: true,
  role: "user"
};

function appForTest(authenticated = true) {
  const app = new Hono({ strict: false });
  if (authenticated) {
    app.use("*", async (c, next) => {
      c.set("user", user);
      await next();
    });
  }
  app.route("/storage", storageRouter);
  return app;
}

let validPng: Uint8Array;

function pngFile(name = "photo.png") {
  return new File([new Uint8Array(validPng)], name, { type: "image/png" });
}

function upload(app: Hono, files: File[], path?: string) {
  const form = new FormData();
  for (const file of files) form.append("file", file);
  if (path) form.set("path", path);
  return app.request("/storage", { method: "POST", body: form });
}

describe("storage upload security", () => {
  beforeAll(async () => {
    validPng = new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 220, g: 180, b: 140, alpha: 1 } } }).png().toBuffer());
    await executeSql(`CREATE TABLE storage_files (
      id TEXT PRIMARY KEY,
      userId TEXT,
      gatewayFileId TEXT,
      fileName TEXT NOT NULL,
      fileSuffix TEXT NOT NULL,
      contentType TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      objectKey TEXT NOT NULL,
      path TEXT NOT NULL,
      downloadUrl TEXT NOT NULL,
      status TEXT NOT NULL,
      errorMessage TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )`);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    storeFile.mockResolvedValue({ id: "stored-1", status: "uploaded" });
    await executeSql("DELETE FROM storage_files");
  });

  it("accepts one supported image with a generated filename and owner", async () => {
    const response = await upload(appForTest(), [pngFile("../../private/customer.png")], "../../private/customer.png");

    expect(response.status).toBe(200);
    expect(storeFile).toHaveBeenCalledTimes(1);
    const [name, , type, options] = storeFile.mock.calls[0] as [string, Uint8Array, string, { userId: string }];
    expect(name).toMatch(/^[0-9a-f-]{36}\.png$/i);
    expect(name).not.toContain("private");
    expect(type).toBe("image/png");
    expect(options.userId).toBe(user.id);
  });

  it("rejects a spoofed MIME or signature before storage", async () => {
    const file = new File(["not an image"], "image.png", { type: "image/png" });
    const response = await upload(appForTest(), [file]);

    expect(response.status).toBe(415);
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("rejects a valid signature when the browser MIME does not match", async () => {
    const file = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "image.jpg", { type: "image/jpeg" });
    const response = await upload(appForTest(), [file]);

    expect(response.status).toBe(415);
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("rejects multiple files", async () => {
    const response = await upload(appForTest(), [pngFile(), pngFile("second.png")]);

    expect(response.status).toBe(400);
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("rejects a request larger than the configured multipart cap before parsing", async () => {
    const tooLarge = new File([new Uint8Array(env.STORAGE_MAX_UPLOAD_BYTES + 1)], "large.png", { type: "image/png" });
    const response = await upload(appForTest(), [tooLarge]);

    expect(response.status).toBe(413);
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("requires an authenticated owner", async () => {
    const response = await upload(appForTest(false), [pngFile()]);

    expect(response.status).toBe(401);
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("does not return a file owned by another account", async () => {
    await executeSql(
      "INSERT INTO storage_files (id, userId, fileName, fileSuffix, contentType, fileSize, objectKey, path, downloadUrl, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["other-file", "user-2", "private.png", "png", "image/png", 9, "key-1", "key-1", "https://files.invalid/private.png", "uploaded"]
    );

    const response = await appForTest().request("/storage/other-file");

    expect(response.status).toBe(404);
  });
});
