import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { bad } from "../lib/errors.js";
// Media storage is a numbered list of buckets read from STORAGE_<n>_* variables
// (see .env.example): S3-compatible ones (R2, S3, custom) or Vercel Blob. New
// uploads go to the storage named by STORAGE_ACTIVE; images already uploaded
// keep their full public URL in the database, so they still load from
// whichever storage they were sent to.
export type StorageType = "vercel-blob" | "r2" | "s3" | "custom";
type S3Storage = {
  id: number;
  type: "r2" | "s3" | "custom";
  name: string;
  endpoint?: string;
  region: string;
  bucket: string;
  keyId: string;
  secret: string;
  publicUrl: string;
};
type BlobStorage = { id: number; type: "vercel-blob"; name: string; token: string };
export type Storage = S3Storage | BlobStorage;
type Config = { storages: Storage[]; active?: Storage };
const types: StorageType[] = ["vercel-blob", "r2", "s3", "custom"];
// Vercel functions reject request bodies over 4.5 MB before they reach Express,
// so uploads through the deployed API are capped just below that.
export const maxUploadBytes = process.env.VERCEL ? 4_400_000 : 8 * 1024 * 1024;
const env = (name: string) => process.env[name]?.trim() || "";
const httpsUrl = (value: string, name: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a full URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  return value.replace(/\/$/, "");
};
function readStorage(id: number): Storage {
  const prefix = `STORAGE_${id}_`;
  const need = (key: string) => {
    const value = env(prefix + key);
    if (!value) throw new Error(`Set ${prefix}${key} for media storage ${id}.`);
    return value;
  };
  const type = need("TYPE").toLowerCase() as StorageType;
  if (!types.includes(type))
    throw new Error(`${prefix}TYPE must be one of: ${types.join(", ")}.`);
  const name = env(prefix + "NAME") || `Storage ${id} (${type})`;
  if (type === "vercel-blob") {
    // Vercel adds BLOB_READ_WRITE_TOKEN when a Blob store is connected to the project.
    const token = env(prefix + "TOKEN") || env("BLOB_READ_WRITE_TOKEN");
    if (!token)
      throw new Error(`Set ${prefix}TOKEN (or BLOB_READ_WRITE_TOKEN) for media storage ${id}.`);
    return { id, type, name, token };
  }
  let endpoint: string | undefined, region: string;
  if (type === "r2") {
    endpoint = `https://${need("ACCOUNT_ID")}.r2.cloudflarestorage.com`;
    region = "auto";
  } else if (type === "s3") {
    region = need("REGION");
  } else {
    // Self-hosted services such as MinIO may run on plain HTTP inside a private network.
    endpoint = need("ENDPOINT").replace(/\/$/, "");
    region = need("REGION");
  }
  return {
    id,
    type,
    name,
    endpoint,
    region,
    bucket: need("BUCKET"),
    keyId: need("KEY_ID"),
    secret: need("SECRET"),
    publicUrl: httpsUrl(need("PUBLIC_URL"), prefix + "PUBLIC_URL"),
  };
}
// Older deployments configured a single bucket with R2_*; treat it as storage 1.
function legacyR2(): Storage | undefined {
  const keys = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_URL",
  ];
  if (!keys.every((key) => env(key))) return undefined;
  return {
    id: 1,
    type: "r2",
    name: "Cloudflare R2",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    region: "auto",
    bucket: env("R2_BUCKET_NAME"),
    keyId: env("R2_ACCESS_KEY_ID"),
    secret: env("R2_SECRET_ACCESS_KEY"),
    publicUrl: httpsUrl(env("R2_PUBLIC_URL"), "R2_PUBLIC_URL"),
  };
}
let config: Config | undefined;
// Reads and validates every declared storage once. Throws on any mistake so a
// misconfigured server fails at startup instead of on the first admin upload.
export function storageConfig(): Config {
  if (config) return config;
  const ids = Object.keys(process.env)
    .map((key) => /^STORAGE_(\d+)_TYPE$/.exec(key)?.[1])
    .filter((id): id is string => Boolean(id))
    .map(Number)
    .filter((id) => id > 0)
    .sort((a, b) => a - b);
  const storages = ids.length ? ids.map(readStorage) : [legacyR2()].filter((s): s is Storage => Boolean(s));
  const wanted = env("STORAGE_ACTIVE");
  let active: Storage | undefined;
  if (wanted) {
    active = storages.find((s) => String(s.id) === wanted);
    if (!active)
      throw new Error(
        `STORAGE_ACTIVE=${wanted} does not match a configured storage. Configured: ${storages.map((s) => s.id).join(", ") || "none"}.`,
      );
  } else active = storages[0];
  return (config = { storages, active });
}
export const storageReady = () => Boolean(storageConfig().active);
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
const clients = new Map<number, S3Client>();
function client(storage: S3Storage) {
  let c = clients.get(storage.id);
  if (!c) {
    c = new S3Client({
      region: storage.region,
      endpoint: storage.endpoint,
      credentials: { accessKeyId: storage.keyId, secretAccessKey: storage.secret },
      // Custom endpoints (MinIO etc.) usually expect bucket/key paths, not bucket subdomains.
      forcePathStyle: storage.type === "custom",
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
    clients.set(storage.id, c);
  }
  return c;
}
// Uploads to the active storage, or to a specific one by number (for scripts).
export async function uploadImage(data: Buffer, storageId?: number) {
  const { storages, active } = storageConfig();
  const storage =
    storageId === undefined ? active : storages.find((s) => s.id === storageId);
  if (!storage)
    throw bad(
      storageId === undefined
        ? "Image uploads are unavailable. Configure media storage (STORAGE_1_*) on the server."
        : `Media storage ${storageId} is not configured.`,
      503,
    );
  if (!data.length || data.length > maxUploadBytes)
    throw bad(`Images must be between 1 byte and ${+(maxUploadBytes / 1048576).toFixed(1)} MB.`);
  const type = imageType(data),
    key = `products/${randomUUID()}.${type.extension}`;
  if (storage.type === "vercel-blob") {
    const blob = await put(key, data, {
      access: "public",
      token: storage.token,
      contentType: type.mime,
      addRandomSuffix: false,
      cacheControlMaxAge: 31536000,
      abortSignal: AbortSignal.timeout(30000),
    });
    return { key, url: blob.url, storage: storage.id };
  }
  await client(storage).send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      Body: data,
      ContentType: type.mime,
      CacheControl: "public, max-age=31536000, immutable",
    }),
    { abortSignal: AbortSignal.timeout(30000) },
  );
  return { key, url: storage.publicUrl + "/" + key, storage: storage.id };
}

// Admin uploads go straight from the browser to the bucket through a short-lived
// signed URL, so files never pass through the API (Vercel caps request bodies at
// 4.5 MB). The signature pins the content type and exact size, and confirmUpload
// then checks the stored file's leading bytes before the admin can save it.
export const mediaLimits = {
  image: { maxBytes: 8 * 1024 * 1024, label: "JPEG, PNG or WebP" },
  video: { maxBytes: 50 * 1024 * 1024, label: "MP4 or WebM" },
};
const mediaTypes: Record<string, { kind: "image" | "video"; extension: string }> = {
  "image/jpeg": { kind: "image", extension: "jpg" },
  "image/png": { kind: "image", extension: "png" },
  "image/webp": { kind: "image", extension: "webp" },
  "video/mp4": { kind: "video", extension: "mp4" },
  "video/webm": { kind: "video", extension: "webm" },
};
// Object keys are "<folder>/<record id>-<uuid>.<ext>": product media under
// products/, category images under categories/, content block images under
// contents/. The record's ID can be read back from the name. A record that isn't
// saved yet gets "<folder>/new-<uuid>", renamed once it has an ID (see
// claimMedia). Files uploaded before this naming ("products/<uuid>") keep their names.
export type MediaFolder = "products" | "categories" | "contents";
const folders: MediaFolder[] = ["products", "categories", "contents"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const uploadKey = new RegExp(
  String.raw`^(products|categories|contents)/(\d+-|new-)${uuid}\.(jpg|png|webp|mp4|webm)$`,
);
export type UploadTarget = { folder?: unknown; recordId?: unknown };
function keyPrefix({ folder, recordId }: UploadTarget) {
  if (!folders.includes(folder as MediaFolder)) throw bad("Unknown upload folder.");
  if (recordId == null || recordId === "") return `${folder}/new-`;
  const id = Number(recordId);
  if (!Number.isSafeInteger(id) || id < 1) throw bad("Unknown record.");
  return `${folder}/${id}-`;
}
function directStorage() {
  const { active } = storageConfig();
  if (!active)
    throw bad(
      "Uploads are unavailable. Configure media storage (STORAGE_1_*) on the server.",
      503,
    );
  if (active.type === "vercel-blob")
    throw bad("Direct uploads need an R2, S3 or custom storage as STORAGE_ACTIVE.", 503);
  return active;
}
export async function signUpload(
  contentType: unknown,
  size: unknown,
  target: UploadTarget,
) {
  const type = typeof contentType === "string" ? mediaTypes[contentType] : undefined;
  if (!type)
    throw bad("Choose a JPEG, PNG or WebP image, or an MP4 or WebM video.");
  const limit = mediaLimits[type.kind];
  if (!Number.isInteger(size) || (size as number) < 1 || (size as number) > limit.maxBytes)
    throw bad(
      `${type.kind === "video" ? "Videos" : "Images"} must be ${limit.label} up to ${limit.maxBytes / 1048576} MB.`,
    );
  const prefix = keyPrefix(target);
  const storage = directStorage();
  const key = `${prefix}${randomUUID()}.${type.extension}`;
  const uploadUrl = await getSignedUrl(
    client(storage),
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      ContentType: contentType as string,
      ContentLength: size as number,
    }),
    { expiresIn: 600, signableHeaders: new Set(["content-type", "content-length"]) },
  );
  return {
    key,
    uploadUrl,
    url: storage.publicUrl + "/" + key,
    mediaType: type.kind,
    // The bucket's CORS rule must allow these request headers.
    headers: { "Content-Type": contentType as string },
  };
}
function matchesSignature(head: Buffer, extension: string) {
  if (extension === "mp4")
    return head.length >= 12 && head.toString("ascii", 4, 8) === "ftyp";
  if (extension === "webm")
    return head.length >= 4 && head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  // Any genuine image is accepted whatever its name: files saved as ".jpg" are
  // often PNG or WebP inside, and browsers render images by their content.
  try {
    return Boolean(imageType(head));
  } catch {
    return false;
  }
}
// Verifies an uploaded object really is the image or video its name claims, and
// deletes it otherwise.
export async function confirmUpload(key: unknown) {
  if (typeof key !== "string" || !uploadKey.test(key)) throw bad("Unknown upload.");
  const storage = directStorage();
  const extension = key.split(".").pop()!;
  const kind = mediaTypes[
    Object.keys(mediaTypes).find((m) => mediaTypes[m].extension === extension)!
  ].kind;
  let head: Buffer, total: number;
  try {
    const object = await client(storage).send(
      new GetObjectCommand({ Bucket: storage.bucket, Key: key, Range: "bytes=0-31" }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    head = Buffer.from(await object.Body!.transformToByteArray());
    total = Number(object.ContentRange?.split("/")[1] ?? object.ContentLength);
  } catch {
    throw bad("The upload didn't reach storage. Please try again.");
  }
  if (!matchesSignature(head, extension) || !(total <= mediaLimits[kind].maxBytes)) {
    await client(storage)
      .send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }))
      .catch(() => {});
    throw bad(
      kind === "video"
        ? "That file isn't a valid MP4 or WebM video."
        : "That file isn't a valid JPEG, PNG or WebP image.",
    );
  }
  return { url: storage.publicUrl + "/" + key, mediaType: kind };
}

// A new record's media is uploaded before it has an ID, as "<folder>/new-<uuid>".
// Once the row exists, copy each such file to "<folder>/<id>-<uuid>" (a
// server-side copy inside the bucket) and report the URL changes. The caller
// deletes the originals with commit() after saving the new URLs, or the copies
// with discard() if saving fails.
export async function claimMedia(
  folder: MediaFolder,
  urls: unknown[],
  recordId: number,
) {
  const pendingKey = new RegExp(
    String.raw`^${folder}/new-(${uuid}\.(jpg|png|webp|mp4|webm))$`,
  );
  const moves: { storage: S3Storage; from: string; to: string }[] = [];
  const renamed = new Map<string, string>();
  const pending = urls.filter(
    (url): url is string =>
      typeof url === "string" && url.includes(`/${folder}/new-`),
  );
  if (pending.length) {
    const storages = storageConfig().storages.filter(
      (s): s is S3Storage => s.type !== "vercel-blob",
    );
    for (const url of new Set(pending)) {
      const storage = storages.find((s) => url.startsWith(s.publicUrl + "/"));
      const from = storage && url.slice(storage.publicUrl.length + 1);
      const match = from && pendingKey.exec(from);
      if (!storage || !from || !match) continue;
      const to = `${folder}/${recordId}-${match[1]}`;
      await client(storage).send(
        new CopyObjectCommand({
          Bucket: storage.bucket,
          CopySource: `${storage.bucket}/${from}`,
          Key: to,
        }),
        { abortSignal: AbortSignal.timeout(60000) },
      );
      moves.push({ storage, from, to });
      renamed.set(url, `${storage.publicUrl}/${to}`);
    }
  }
  const remove = (pick: "from" | "to") =>
    Promise.all(
      moves.map((move) =>
        client(move.storage)
          .send(new DeleteObjectCommand({ Bucket: move.storage.bucket, Key: move[pick] }))
          .catch(() => {}),
      ),
    );
  return {
    renamed,
    commit: () => remove("from"),
    discard: () => remove("to"),
  };
}
