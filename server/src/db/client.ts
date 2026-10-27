import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema.js";
import { databaseUrlFromEnv } from "./url.js";

function create(url: string) {
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 10,
    timezone: "Z",
    charset: "utf8mb4",
    // JSON numbers/decimals as plain JS numbers
    decimalNumbers: true,
  });
  // Store and compare every timestamp in UTC regardless of the MySQL server's time zone.
  pool.pool.on("connection", (connection) => { connection.query("SET time_zone = '+00:00'"); });
  return { pool, db: drizzle(pool, { schema, mode: "default" }) };
}

export type Db = ReturnType<typeof create>["db"];
/** A transaction handle; accepted anywhere a Db is. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Conn = Db | Tx;

let current: ReturnType<typeof create> | null = null;

/** Opens the connection pool (once). Uses DATABASE_URL / DB_* settings when no url is given. */
export async function connectDb(url = databaseUrlFromEnv()) {
  if (current) return current.db;
  if (!url) throw new Error("DATABASE_URL (or DB_NAME/DB_USER/DB_PASSWORD) is required");
  current = create(url);
  await current.pool.query("SELECT 1");
  return current.db;
}

export function getDb(): Db {
  if (!current) throw new Error("Database not connected. Call connectDb() first.");
  return current.db;
}

export async function pingDb() {
  if (!current) return false;
  try { await current.pool.query("SELECT 1"); return true; } catch { return false; }
}

export async function closeDb() {
  const pool = current?.pool;
  current = null;
  await pool?.end();
}
