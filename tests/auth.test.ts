import assert from "node:assert/strict";
import { test } from "node:test";
import { scryptSync } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  hashPassword,
  verifyPassword,
  needsPasswordUpgrade,
} from "../server/services/password.js";
import { parseLogin, validateNewPassword } from "../server/auth/validation.js";
import {
  readSessionToken,
  setSessionCookie,
  clearSessionCookie,
  hashToken,
} from "../server/auth/cookies.js";
import {
  adminRequestSecurity,
  requireAdmin,
} from "../server/auth/middleware.js";
import { createAdminAuthService } from "../server/auth/service.js";
import type { AdminRepository } from "../server/auth/repository.js";

const password = "a sufficiently long passphrase";

test("salted current hashes verify and reject tampering", async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt:v1:131072:8:1:[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong", first), false);
  assert.equal(needsPasswordUpgrade(first), false);
  for (const malformed of [
    first + ":extra",
    first.replace("131072", "1073741824"),
    "scrypt:bad:bad",
    first.slice(0, -1),
    first.slice(0, -1) + "z",
  ]) {
    assert.equal(await verifyPassword(password, malformed), false);
  }
});

test("legacy passwords remain valid and need an upgrade", async () => {
  const salt = "ab".repeat(16);
  const hash = `scrypt:${salt}:${scryptSync("old-password", salt, 64).toString("hex")}`;
  assert.equal(await verifyPassword("old-password", hash), true);
  assert.equal(await verifyPassword("incorrect", hash), false);
  assert.equal(needsPasswordUpgrade(hash), true);
});

test("credential validation preserves passwords and rejects malformed input", () => {
  assert.deepEqual(
    parseLogin({ email: " ADMIN@Example.COM ", password: " legacy " }),
    { email: "admin@example.com", password: " legacy " },
  );
  for (const body of [
    null,
    [],
    {},
    { email: "bad", password },
    { email: "a@b.com", password: "x".repeat(1025) },
  ])
    assert.throws(() => parseLogin(body));
  assert.throws(() => validateNewPassword("short"));
  assert.throws(() => validateNewPassword("😀".repeat(8)));
  validateNewPassword(password);
});

test("session parser rejects duplicate, malformed and oversized cookie tokens", () => {
  const token = "ab".repeat(32);
  assert.equal(readSessionToken(`other=1; crysmona_admin=${token}`), token);
  for (const header of [
    undefined,
    "crysmona_admin=bad",
    `crysmona_admin=${token}; crysmona_admin=${token}`,
    `crysmona_admin=${token}00`,
  ])
    assert.equal(readSessionToken(header), undefined);
});

test("service returns generic failures, upgrades old hashes and stores only token hashes", async () => {
  const salt = "cd".repeat(16);
  const legacy = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  let account: any = {
    id: 1,
    email: "admin@example.com",
    password_hash: legacy,
    active: true,
  };
  let issued: unknown[] = [];
  let allowed = true;
  let attempts = 0;
  const repository = {
    findByEmail: async () => account,
    issueSession: async (...args: unknown[]) => {
      issued = args;
      return allowed;
    },
  } as unknown as AdminRepository;
  const service = createAdminAuthService(repository, async () => {
    attempts++;
  });
  const result = await service.login(
    { email: account.email, password },
    "127.0.0.1",
    "ab".repeat(32),
  );
  assert.equal(issued[1], hashToken(result.token));
  assert.notEqual(issued[1], result.token);
  assert.equal(issued[2], hashToken("ab".repeat(32)));
  assert.equal(await verifyPassword(password, issued[3] as string), true);
  assert.equal(needsPasswordUpgrade(issued[3] as string), false);
  allowed = false;
  await assert.rejects(
    service.login({ email: account.email, password }, "127.0.0.1"),
    { status: 401, message: "Email or password is incorrect." },
  );
  account.active = false;
  await assert.rejects(
    service.login({ email: account.email, password }, "127.0.0.1"),
    { status: 401, message: "Email or password is incorrect." },
  );
  account = undefined;
  await assert.rejects(
    service.login({ email: "missing@example.com", password }, "127.0.0.1"),
    { status: 401, message: "Email or password is incorrect." },
  );
  assert.equal(attempts, 4);
});

test("HTTP protection rejects cross-origin mutations and validates sessions", async () => {
  const token = "ab".repeat(32);
  const app = express();
  app.use(adminRequestSecurity("https://shop.example.com"));
  app.post("/mutate", (_req, res) => res.sendStatus(204));
  app.get(
    "/session",
    requireAdmin({
      findSession: async (hash: string) =>
        hash === hashToken(token) ? { id: 1, email: "a@b.com" } : undefined,
    } as AdminRepository),
    (req, res) => res.json(req.adminAccount),
  );
  app.get("/cookie", (_req, res) => {
    setSessionCookie(res, token);
    res.sendStatus(204);
  });
  app.get("/clear", (_req, res) => {
    clearSessionCookie(res);
    res.sendStatus(204);
  });
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status || 500).json({ error: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const headers of [
      { origin: "https://evil.example.com" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
    ]) {
      assert.equal(
        (await fetch(base + "/mutate", { method: "POST", headers })).status,
        403,
      );
    }
    assert.equal(
      (
        await fetch(base + "/mutate", {
          method: "POST",
          headers: { origin: "https://shop.example.com" },
        })
      ).status,
      204,
    );
    assert.equal((await fetch(base + "/session")).status, 401);
    assert.equal(
      (
        await fetch(base + "/session", {
          headers: { cookie: `crysmona_admin=${"cd".repeat(32)}` },
        })
      ).status,
      401,
    );
    const session = await fetch(base + "/session", {
      headers: { cookie: `crysmona_admin=${token}` },
    });
    assert.equal(session.status, 200);
    assert.equal(session.headers.get("cache-control"), "no-store");
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const cookie = (await fetch(base + "/cookie")).headers.get("set-cookie")!;
      for (const flag of [
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        "Path=/api/admin",
        "Max-Age=28800",
      ])
        assert.ok(cookie.includes(flag));
      const cleared = (await fetch(base + "/clear")).headers.get("set-cookie")!;
      assert.ok(cleared.includes("Path=/api/admin"));
      assert.ok(cleared.includes("Expires=Thu, 01 Jan 1970"));
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldEnv;
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
