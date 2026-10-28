// Creates/updates all tables: `npm run db:migrate`. Safe to run repeatedly.
import "dotenv/config";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectDb, closeDb } from "./client.js";

export const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export async function runMigrations(url?: string) {
  const db = await connectDb(url);
  await migrate(db, { migrationsFolder });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runMigrations(); console.log("Database tables are up to date."); }
  finally { await closeDb(); }
}
