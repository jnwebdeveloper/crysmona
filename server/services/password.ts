import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { MAX_PASSWORD_LENGTH } from "../auth/validation.js";

// OWASP scrypt baseline. Store parameters with new hashes for future upgrades.
const CURRENT = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const LEGACY = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const KEY_BYTES = 64;
const PREFIX = "scrypt:v1:131072:8:1:";
const HEX_SALT = /^[a-f0-9]{32}$/;
const HEX_KEY = /^[a-f0-9]{128}$/;

// Bound expensive work per process instead of allowing unbounded memory use.
let active = 0;
const waiting: Array<() => void> = [];
async function derive(
  password: string,
  salt: string,
  options: typeof CURRENT,
): Promise<Buffer> {
  if (active >= 2) {
    if (waiting.length >= 16) {
      throw Object.assign(
        new Error("Authentication is busy. Please try again."),
        { status: 503 },
      );
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    active++;
  }
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, KEY_BYTES, options, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length > MAX_PASSWORD_LENGTH)
    throw new Error("Invalid password length.");
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, CURRENT);
  return `${PREFIX}${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (
    typeof password !== "string" ||
    !password ||
    password.length > MAX_PASSWORD_LENGTH
  )
    return false;
  if (typeof encoded !== "string") return false;
  const parts = encoded.split(":");
  const legacy = parts.length === 3 && parts[0] === "scrypt";
  const current = parts.length === 7 && encoded.startsWith(PREFIX);
  if (!legacy && !current) return false;
  const salt = parts[parts.length - 2];
  const digest = parts[parts.length - 1];
  // Never execute arbitrary cost parameters supplied by a stored hash.
  if (!HEX_SALT.test(salt) || !HEX_KEY.test(digest)) return false;
  const actual = await derive(password, salt, legacy ? LEGACY : CURRENT);
  return timingSafeEqual(actual, Buffer.from(digest, "hex"));
}

export function needsPasswordUpgrade(encoded: string): boolean {
  return !encoded.startsWith(PREFIX);
}
