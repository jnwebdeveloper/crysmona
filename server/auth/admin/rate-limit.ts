import type { Pool } from "pg";
import { bad } from "../../lib/errors.js";
import { hashToken } from "./cookies.js";

const WINDOW_SECONDS = 15 * 60;
export const accountAttemptKey = (email: string) =>
  hashToken(`account:${email}`);

export function createLoginLimiter(database: Pool) {
  return async (ip: string, email: string): Promise<void> => {
    const buckets = [
      { key: hashToken(`ip:${ip}`), limit: 30 },
      { key: accountAttemptKey(email), limit: 10 },
    ];
    await database.query(
      "DELETE FROM admin_login_attempts WHERE expires_at <= now()",
    );
    // Count before hashing; UPSERT serializes concurrent attempts on each key.
    for (const bucket of buckets) {
      const result = await database.query<{
        attempts: number;
        retry_after: number;
      }>(
        `INSERT INTO admin_login_attempts(key_hash, attempts, expires_at)
         VALUES ($1, 1, now() + $2 * interval '1 second')
         ON CONFLICT (key_hash) DO UPDATE SET
           attempts = CASE WHEN admin_login_attempts.expires_at <= now()
             THEN 1 ELSE LEAST(admin_login_attempts.attempts + 1, $3 + 1) END,
           expires_at = CASE WHEN admin_login_attempts.expires_at <= now()
             THEN now() + $2 * interval '1 second' ELSE admin_login_attempts.expires_at END
         RETURNING attempts, GREATEST(1, ceil(extract(epoch FROM expires_at - now())))::int AS retry_after`,
        [bucket.key, WINDOW_SECONDS, bucket.limit],
      );
      if (result.rows[0].attempts > bucket.limit) {
        throw Object.assign(
          bad("Too many login attempts. Try again later.", 429),
          {
            retryAfter: result.rows[0].retry_after,
          },
        );
      }
    }
  };
}
