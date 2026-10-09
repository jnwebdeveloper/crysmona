import "dotenv/config";
import pg from "pg";

const configuredUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production" && !configuredUrl) {
  throw new Error("DATABASE_URL is required in production.");
}
const databaseUrl = new URL(
  configuredUrl || "postgresql://postgres:postgres@localhost:5436/Crysmona",
);
if (decodeURIComponent(databaseUrl.pathname.slice(1)) !== "Crysmona") {
  throw new Error("DATABASE_URL must point to the Crysmona database.");
}
// Each serverless instance gets its own pool; keep it small so concurrent instances
// stay within the database's connection limit, and fail fast instead of hanging.
const serverless = Boolean(process.env.VERCEL);
export const pool = new pg.Pool({
  connectionString: databaseUrl.toString(),
  max: serverless ? 3 : 10,
  idleTimeoutMillis: serverless ? 10_000 : 30_000,
  connectionTimeoutMillis: 10_000,
});
export const q = (sql: string, params: any[] = []) => pool.query(sql, params);
