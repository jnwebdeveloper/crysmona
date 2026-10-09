import type { Pool } from "pg";
import { SESSION_LIFETIME_MS } from "./cookies.js";
import { accountAttemptKey } from "./rate-limit.js";

export interface AdminAccount {
  id: number;
  email: string;
  password_hash: string;
  active: boolean;
}
export type SessionAccount = Pick<AdminAccount, "id" | "email">;

export function createAdminRepository(database: Pool) {
  return {
    async findByEmail(email: string): Promise<AdminAccount | undefined> {
      const result = await database.query<AdminAccount>(
        "SELECT id, email, password_hash, active FROM admin_accounts WHERE email = $1",
        [email],
      );
      return result.rows[0];
    },
    async createAccount(email: string, passwordHash: string): Promise<void> {
      await database.query(
        "INSERT INTO admin_accounts(email, password_hash) VALUES ($1, $2)",
        [email, passwordHash],
      );
    },
    async findSession(tokenHash: string): Promise<SessionAccount | undefined> {
      const result = await database.query<SessionAccount>(
        `SELECT a.id, a.email FROM admin_sessions s JOIN admin_accounts a ON a.id = s.admin_id
         WHERE s.token_hash = $1 AND s.expires_at > now() AND a.active = true`,
        [tokenHash],
      );
      return result.rows[0];
    },
    async deleteSession(tokenHash: string): Promise<void> {
      await database.query("DELETE FROM admin_sessions WHERE token_hash = $1", [
        tokenHash,
      ]);
    },
    async issueSession(
      account: AdminAccount,
      tokenHash: string,
      previousHash?: string,
      upgradedHash?: string,
    ): Promise<boolean> {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        // Serialize with resets: a password verified before a reset must not create a session afterwards.
        const current = (
          await client.query<AdminAccount>(
            "SELECT id, email, password_hash, active FROM admin_accounts WHERE id = $1 FOR UPDATE",
            [account.id],
          )
        ).rows[0];
        if (
          !current?.active ||
          current.password_hash !== account.password_hash
        ) {
          await client.query("ROLLBACK");
          return false;
        }
        if (upgradedHash)
          await client.query(
            "UPDATE admin_accounts SET password_hash = $1 WHERE id = $2",
            [upgradedHash, account.id],
          );
        if (previousHash)
          await client.query(
            "DELETE FROM admin_sessions WHERE token_hash = $1",
            [previousHash],
          );
        await client.query(
          "DELETE FROM admin_sessions WHERE expires_at <= now()",
        );
        await client.query(
          "INSERT INTO admin_sessions(token_hash, admin_id, expires_at) VALUES ($1, $2, now() + $3 * interval '1 millisecond')",
          [tokenHash, account.id, SESSION_LIFETIME_MS],
        );
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async resetPassword(email: string, passwordHash: string): Promise<boolean> {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query<{ id: number }>(
          "UPDATE admin_accounts SET password_hash = $1 WHERE email = $2 RETURNING id",
          [passwordHash, email],
        );
        if (!result.rows[0]) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query("DELETE FROM admin_sessions WHERE admin_id = $1", [
          result.rows[0].id,
        ]);
        await client.query(
          "DELETE FROM admin_login_attempts WHERE key_hash = $1",
          [accountAttemptKey(email)],
        );
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
export type AdminRepository = ReturnType<typeof createAdminRepository>;
