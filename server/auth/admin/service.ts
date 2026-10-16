import { randomBytes } from "node:crypto";
import { bad } from "../../lib/errors.js";
import {
  hashPassword,
  needsPasswordUpgrade,
  verifyPassword,
} from "./password.js";
import { hashToken, newSessionToken } from "./cookies.js";
import type { AdminRepository, SessionAccount } from "./repository.js";
import {
  normalizeEmail,
  parseLogin,
  parsePasswordChange,
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
    async changePassword(
      account: SessionAccount,
      body: unknown,
      ip: string,
      tokenHash: string,
    ) {
      const { currentPassword, newPassword } = parsePasswordChange(body);
      // Shares the login limiter so a stolen session cannot brute-force the current password.
      await limitLogin(ip, account.email);
      const stored = await repository.findByEmail(account.email);
      if (
        !stored?.active ||
        !(await verifyPassword(currentPassword, stored.password_hash))
      )
        throw bad("Current password is incorrect.", 400);
      validateNewPassword(newPassword);
      if (newPassword === currentPassword)
        throw bad("Choose a new password that differs from the current one.");
      const changed = await repository.changePassword(
        stored.id,
        stored.password_hash,
        await hashPassword(newPassword),
        tokenHash,
      );
      if (!changed)
        throw bad(
          "Your password was changed elsewhere. Please try again.",
          409,
        );
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
