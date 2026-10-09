import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createAdminRepository } from "../server/auth/repository.js";
import {
  createLoginLimiter,
  accountAttemptKey,
} from "../server/auth/rate-limit.js";
import { hashPassword, verifyPassword } from "../server/services/password.js";
import { hashToken } from "../server/auth/cookies.js";

const connectionString = process.env.TEST_AUTH_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "Set TEST_AUTH_DATABASE_URL to a dedicated test database. Application DATABASE_URL is deliberately ignored.",
  );

test("PostgreSQL authentication security", async (t) => {
  const schema = `auth_test_${randomBytes(8).toString("hex")}`;
  const bootstrap = new pg.Pool({ connectionString });
  await bootstrap.query(`CREATE SCHEMA ${schema}`);
  const db = new pg.Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  const repository = createAdminRepository(db);
  const limit = createLoginLimiter(db);
  try {
    for (const file of [
      "006-admin-auth.sql",
      "009-admin-security.sql",
      "009-admin-security.sql",
    ]) {
      await db.query(
        await readFile(new URL(`../database/${file}`, import.meta.url), "utf8"),
      );
    }
    await t.test(
      "reset changes hash and revokes all sessions without reactivating account",
      async () => {
        const oldHash = await hashPassword("original long password");
        await repository.createAccount("reset@example.com", oldHash);
        const account = (await repository.findByEmail("reset@example.com"))!;
        await repository.issueSession(account, hashToken("one"));
        await repository.issueSession(account, hashToken("two"));
        await limit("reset-ip", account.email);
        await db.query("UPDATE admin_accounts SET active=false WHERE id=$1", [
          account.id,
        ]);
        const newHash = await hashPassword("replacement long password");
        assert.equal(
          await repository.resetPassword(account.email, newHash),
          true,
        );
        const updated = (await repository.findByEmail(account.email))!;
        assert.equal(updated.active, false);
        assert.equal(
          await verifyPassword(
            "replacement long password",
            updated.password_hash,
          ),
          true,
        );
        assert.equal(
          await verifyPassword("original long password", updated.password_hash),
          false,
        );
        assert.equal(await repository.findSession(hashToken("one")), undefined);
        assert.equal(
          (
            await db.query("SELECT * FROM admin_sessions WHERE admin_id=$1", [
              account.id,
            ])
          ).rowCount,
          0,
        );
        assert.equal(
          (
            await db.query(
              "SELECT * FROM admin_login_attempts WHERE key_hash=$1",
              [accountAttemptKey(account.email)],
            )
          ).rowCount,
          0,
        );
        assert.equal(
          await repository.resetPassword("missing@example.com", newHash),
          false,
        );
      },
    );
    await t.test(
      "a login verified before a reset cannot create a session afterwards",
      async () => {
        await repository.createAccount("race@example.com", "old-hash");
        const stale = (await repository.findByEmail("race@example.com"))!;
        await repository.resetPassword(stale.email, "new-hash");
        assert.equal(
          await repository.issueSession(stale, hashToken("stale")),
          false,
        );
        assert.equal(
          await repository.findSession(hashToken("stale")),
          undefined,
        );
      },
    );
    await t.test(
      "reset waits for an in-flight session transaction and then removes its session",
      async () => {
        await repository.createAccount("locked@example.com", "old");
        const account = (await repository.findByEmail("locked@example.com"))!;
        const client = await db.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            "SELECT id FROM admin_accounts WHERE id=$1 FOR UPDATE",
            [account.id],
          );
          const reset = repository.resetPassword(account.email, "new");
          await client.query(
            "INSERT INTO admin_sessions VALUES($1,$2,now()+interval '1 hour')",
            [hashToken("concurrent"), account.id],
          );
          await client.query("COMMIT");
          assert.equal(await reset, true);
          assert.equal(
            await repository.findSession(hashToken("concurrent")),
            undefined,
          );
        } finally {
          client.release();
        }
      },
    );
    await t.test(
      "failure revoking sessions rolls the password change back",
      async () => {
        await repository.createAccount("rollback@example.com", "original");
        const account = (await repository.findByEmail("rollback@example.com"))!;
        await repository.issueSession(account, hashToken("rollback"));
        await db.query(
          `CREATE FUNCTION reject_session_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`,
        );
        await db.query(
          "CREATE TRIGGER reject_delete BEFORE DELETE ON admin_sessions FOR EACH ROW EXECUTE FUNCTION reject_session_delete()",
        );
        try {
          await assert.rejects(
            repository.resetPassword(account.email, "replacement"),
          );
          assert.equal(
            (await repository.findByEmail(account.email))!.password_hash,
            "original",
          );
          assert.ok(await repository.findSession(hashToken("rollback")));
        } finally {
          await db.query("DROP TRIGGER reject_delete ON admin_sessions");
        }
      },
    );
    await t.test(
      "expired and disabled sessions are rejected; rotation removes previous session",
      async () => {
        await repository.createAccount("sessions@example.com", "hash");
        const account = (await repository.findByEmail("sessions@example.com"))!;
        await repository.issueSession(account, hashToken("previous"));
        await repository.issueSession(
          account,
          hashToken("next"),
          hashToken("previous"),
        );
        assert.equal(
          await repository.findSession(hashToken("previous")),
          undefined,
        );
        assert.ok(await repository.findSession(hashToken("next")));
        await db.query(
          "UPDATE admin_sessions SET expires_at=now()-interval '1 second' WHERE admin_id=$1",
          [account.id],
        );
        assert.equal(
          await repository.findSession(hashToken("next")),
          undefined,
        );
        await db.query("UPDATE admin_accounts SET active=false WHERE id=$1", [
          account.id,
        ]);
        assert.equal(
          await repository.issueSession(account, hashToken("disabled")),
          false,
        );
      },
    );
    await t.test(
      "account throttling is atomic across concurrent instances and source IPs",
      async () => {
        const results = await Promise.allSettled(
          Array.from({ length: 20 }, (_, i) =>
            createLoginLimiter(db)(`ip-${i}`, "limited@example.com"),
          ),
        );
        assert.equal(
          results.filter((r) => r.status === "fulfilled").length,
          10,
        );
        for (const result of results)
          if (result.status === "rejected") {
            assert.equal(result.reason.status, 429);
            assert.ok(
              result.reason.retryAfter > 0 && result.reason.retryAfter <= 900,
            );
          }
        await assert.rejects(
          createLoginLimiter(db)("new-ip", "limited@example.com"),
          { status: 429 },
        );
        await db.query(
          "UPDATE admin_login_attempts SET expires_at=now()-interval '1 second' WHERE key_hash=$1",
          [accountAttemptKey("limited@example.com")],
        );
        await limit("new-ip", "limited@example.com");
      },
    );
    await t.test(
      "IP throttling blocks password spraying across accounts",
      async () => {
        for (let i = 0; i < 30; i++)
          await limit("sprayer", `target${i}@example.com`);
        await assert.rejects(limit("sprayer", "another@example.com"), {
          status: 429,
        });
      },
    );
  } finally {
    await db.end();
    await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);
    await bootstrap.end();
  }
});
