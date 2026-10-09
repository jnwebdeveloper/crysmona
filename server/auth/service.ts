import { randomBytes } from "node:crypto";
import { bad } from "../errors.js";
import {
  hashPassword,
  needsPasswordUpgrade,
  verifyPassword,
} from "../services/password.js";
import { hashToken, newSessionToken } from "./cookies.js";
import type { AdminRepository } from "./repository.js";
import {
  normalizeEmail,
  parseLogin,
  validateNewPassword,
} from "./validation.js";

export function createAdminAuthService(
  repository: AdminRepository,
  limitLogin: (ip: string, email: string) => Promise<void>,
) {
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = () =>
    (dummyHash ??= hashPassword(randomBytes(32).toString("hex")).catch(
      (error) => {
        dummyHash = undefined;
        throw error;
      },
    ));
  return {
    async login(body: unknown, ip: string, previousToken?: string) {
      const { email, password } = parseLogin(body);
      await limitLogin(ip, email);
      const account = await repository.findByEmail(email);
      const storedHash = account?.password_hash || (await getDummyHash());
      const valid = await verifyPassword(password, storedHash);
      // Old or damaged hashes should not provide a cheap username timing oracle.
      if (needsPasswordUpgrade(storedHash))
        await verifyPassword(password, await getDummyHash());
      if (!valid || !account?.active)
        throw bad("Email or password is incorrect.", 401);
      const upgradedHash = needsPasswordUpgrade(storedHash)
        ? await hashPassword(password)
        : undefined;
      const token = newSessionToken();
      const issued = await repository.issueSession(
        account,
        hashToken(token),
        previousToken ? hashToken(previousToken) : undefined,
        upgradedHash,
      );
      if (!issued) throw bad("Email or password is incorrect.", 401);
      return { email: account.email, token };
    },
    async createAccount(emailInput: unknown, password: string) {
      const email = normalizeEmail(emailInput);
      validateNewPassword(password);
      await repository.createAccount(email, await hashPassword(password));
      return email;
    },
    async resetPassword(emailInput: unknown, password: string) {
      const email = normalizeEmail(emailInput);
      validateNewPassword(password);
      if (
        !(await repository.resetPassword(email, await hashPassword(password)))
      ) {
        throw bad("No admin account exists for that email.", 404);
      }
      return email;
    },
  };
}
export type AdminAuthService = ReturnType<typeof createAdminAuthService>;
