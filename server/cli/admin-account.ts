import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { StringDecoder } from "node:string_decoder";
import { stdin, stdout, stderr } from "node:process";
import { adminAuthService } from "../auth/index.js";
import { pool } from "../db.js";

// Read directly in raw mode: no password echo and no shell-history entry.
export function readSecret(label: string): Promise<string> {
  if (!stdin.isTTY || !stderr.isTTY)
    throw new Error(
      "Use an interactive terminal or provide ADMIN_PASSWORD securely through the environment.",
    );
  stderr.write(label);
  const previousRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const decoder = new StringDecoder("utf8");
    function finish(error?: Error) {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      stdin.off("error", onError);
      stdin.setRawMode(previousRaw);
      stdin.pause();
      stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    }
    function onEnd() {
      finish(new Error("Password input ended."));
    }
    function onError(error: Error) {
      finish(error);
    }
    function onData(data: Buffer) {
      for (const char of decoder.write(data)) {
        if (char === "\u0003" || char === "\u0004")
          return finish(new Error("Cancelled."));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f" || char === "\b")
          value = [...value].slice(0, -1).join("");
        else if (char >= " " && char !== "\u001b") {
          value += char;
          if (value.length > 1024)
            return finish(new Error("Password is too long."));
        }
      }
    }
    stdin.on("data", onData);
    stdin.once("end", onEnd);
    stdin.once("error", onError);
  });
}

export async function runAdminCommand(mode: "create" | "reset"): Promise<void> {
  try {
    let email = process.env.ADMIN_EMAIL;
    let password = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    if (!email) {
      if (!stdin.isTTY) throw new Error("Provide ADMIN_EMAIL.");
      const prompt = createInterface({ input: stdin, output: stdout });
      try {
        email = await prompt.question("Admin email: ");
      } finally {
        prompt.close();
      }
    }
    if (password === undefined) {
      password = await readSecret("New password (at least 15 characters): ");
      const confirmation = await readSecret("Confirm password: ");
      if (password !== confirmation) throw new Error("Passwords do not match.");
    }
    if (mode === "create") {
      await adminAuthService.createAccount(email, password);
      console.log("Admin account created.");
    } else {
      await adminAuthService.resetPassword(email, password);
      console.log(
        "Admin password reset. Existing sessions revoked; account activation status unchanged.",
      );
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message =
      code === "23505"
        ? "That admin account already exists. Use npm run admin:reset."
        : code === "42P01"
          ? "Admin tables are missing. Run database setup and the admin security migration first."
          : code
            ? "Database operation failed. Check database access and migrations."
            : error instanceof Error
              ? error.message
              : "Admin operation failed.";
    console.error(message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
