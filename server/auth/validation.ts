import { bad } from "../errors.js";

export const MAX_PASSWORD_LENGTH = 1024;
export const MIN_NEW_PASSWORD_LENGTH = 15;

export function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    throw bad("Enter a valid email address.");
  }
  return email;
}

export function validateNewPassword(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    [...value].length < MIN_NEW_PASSWORD_LENGTH ||
    value.length > MAX_PASSWORD_LENGTH
  ) {
    throw bad(
      `Use a password of at least ${MIN_NEW_PASSWORD_LENGTH} characters and at most ${MAX_PASSWORD_LENGTH} UTF-16 code units.`,
    );
  }
}

export function parseLogin(body: unknown): { email: string; password: string } {
  if (!body || typeof body !== "object")
    throw bad("Enter a valid email and password.");
  const { email, password } = body as Record<string, unknown>;
  // Existing passwords remain usable even if they predate the creation policy.
  if (
    typeof password !== "string" ||
    !password ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw bad("Enter a valid email and password.");
  }
  return { email: normalizeEmail(email), password };
}
