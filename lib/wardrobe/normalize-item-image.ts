import sharp from "sharp";

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function normalizeItemImage(bytes: Buffer, mimeType: string) {
  if (!supportedTypes.has(mimeType)) throw new Error("UNSUPPORTED_IMAGE_TYPE");
  if (bytes.length > 8 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");

  const output = await sharp(bytes, {
    failOn: "warning",
    limitInputPixels: 40_000_000,
    sequentialRead: true,
  })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(1200, 1200, {
      fit: "contain",
      background: "#ffffff",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();

  return { bytes: output, mimeType: "image/jpeg" };
}
