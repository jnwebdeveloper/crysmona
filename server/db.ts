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
export const pool = new pg.Pool({ connectionString: databaseUrl.toString() });
export const q = (sql: string, params: any[] = []) => pool.query(sql, params);
