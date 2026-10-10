import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { bad } from "../lib/errors.js";
export const r2Ready = () =>
  [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_URL",
  ].every((key) => Boolean(process.env[key]));
export function imageType(data: Buffer) {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { mime: "image/png", extension: "png" };
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255)
    return { mime: "image/jpeg", extension: "jpg" };
  if (
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return { mime: "image/webp", extension: "webp" };
  throw bad("Choose a JPEG, PNG or WebP image.");
}
export async function uploadImage(data: Buffer) {
  if (!r2Ready())
    throw bad(
      "Image uploads are unavailable. Configure the Cloudflare R2 bucket and credentials on the server.",
      503,
    );
  if (!data.length || data.length > 8 * 1024 * 1024)
    throw bad("Images must be between 1 byte and 8 MB.");
  const type = imageType(data),
    key = `products/${randomUUID()}.${type.extension}`;
  const publicUrl = new URL(process.env.R2_PUBLIC_URL!);
  if (publicUrl.protocol !== "https:")
    throw bad("R2_PUBLIC_URL must use HTTPS.", 503);
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: data,
        ContentType: type.mime,
        CacheControl: "public, max-age=31536000, immutable",
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
  } finally {
    client.destroy();
  }
  return {
    key,
    url: process.env.R2_PUBLIC_URL!.replace(/\/$/, "") + "/" + key,
  };
}
