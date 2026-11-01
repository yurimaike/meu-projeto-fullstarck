import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidImageError, normalizeUploadedImage } from "../services/image-validation";

async function pngFixture(width = 3, height = 2) {
  return new Uint8Array(await sharp({
    create: { width, height, channels: 4, background: { r: 210, g: 170, b: 130, alpha: 1 } }
  }).png().toBuffer());
}

describe("uploaded image normalization", () => {
  it("decodes and rewrites a valid PNG into a clean PNG", async () => {
    const source = await pngFixture();
    const normalized = await normalizeUploadedImage(source, "image/png");
    const metadata = await sharp(normalized.bytes).metadata();

    expect(normalized).toMatchObject({ contentType: "image/png", extension: "png", width: 3, height: 2 });
    expect(metadata.format).toBe("png");
  });

  it("rejects a browser MIME that does not match the image signature", async () => {
    await expect(normalizeUploadedImage(await pngFixture(), "image/jpeg"))
      .rejects.toMatchObject({ status: 415 });
  });

  it("rejects a truncated file even when its header claims PNG", async () => {
    await expect(normalizeUploadedImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"))
      .rejects.toBeInstanceOf(InvalidImageError);
  });

  it("rejects dimensions above the configured pixel ceiling before full decode", async () => {
    const oversized = await pngFixture(5000, 4000);

    await expect(normalizeUploadedImage(oversized, "image/png"))
      .rejects.toMatchObject({ status: 413 });
  });
});
