import sharp from "sharp";
import { env } from "../_core/env";

export class InvalidImageError extends Error {
  constructor(readonly status: 413 | 415, message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

type ImageFormat = { contentType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp"; sharpFormat: "jpeg" | "png" | "webp" };

const formats: ImageFormat[] = [
  { contentType: "image/jpeg", extension: "jpg", sharpFormat: "jpeg" },
  { contentType: "image/png", extension: "png", sharpFormat: "png" },
  { contentType: "image/webp", extension: "webp", sharpFormat: "webp" }
];

function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return formats[0];
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return formats[1];
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return formats[2];
  return null;
}

export async function normalizeUploadedImage(input: Uint8Array, claimedContentType: string) {
  const detected = detectFormat(input);
  if (!detected || detected.contentType !== claimedContentType) {
    throw new InvalidImageError(415, "Upload a valid JPEG, PNG, or WebP image");
  }

  const options = { failOn: "error" as const, limitInputPixels: env.STORAGE_MAX_IMAGE_PIXELS };
  try {
    const metadata = await sharp(input, { failOn: "error" }).metadata();
    if (
      metadata.format !== detected.sharpFormat ||
      !metadata.width || !metadata.height ||
      metadata.width > 6000 || metadata.height > 6000 ||
      metadata.width * metadata.height > env.STORAGE_MAX_IMAGE_PIXELS
    ) {
      throw new InvalidImageError(413, "Image dimensions exceed the allowed limit");
    }

    const normalized = await sharp(input, options)
      .rotate()
      .toFormat(detected.sharpFormat, detected.sharpFormat === "jpeg" ? { quality: 85 } : detected.sharpFormat === "webp" ? { quality: 82 } : { compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });

    if (normalized.info.width > 6000 || normalized.info.height > 6000 || normalized.info.width * normalized.info.height > env.STORAGE_MAX_IMAGE_PIXELS) {
      throw new InvalidImageError(413, "Image dimensions exceed the allowed limit");
    }
    if (normalized.data.byteLength > env.STORAGE_MAX_UPLOAD_BYTES) {
      throw new InvalidImageError(413, "The processed image exceeds the allowed size");
    }

    return {
      bytes: new Uint8Array(normalized.data),
      contentType: detected.contentType,
      extension: detected.extension,
      width: normalized.info.width,
      height: normalized.info.height
    };
  } catch (error) {
    if (error instanceof InvalidImageError) throw error;
    throw new InvalidImageError(415, "The uploaded image is invalid or damaged");
  }
}
