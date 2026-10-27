import "dotenv/config";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import { databaseUrlFromEnv } from "../../src/db/url.js";
import { closeDb } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";

/**
 * Creates a throw-away MySQL database (all tables via the real migrations), connects the
 * app to it, and returns its URL plus a `drop()` that disconnects and deletes it.
 * Uses the server/user from DATABASE_URL; that user needs CREATE/DROP DATABASE rights.
 */
export async function createTestDatabase(prefix: string) {
  const base = databaseUrlFromEnv();
  if (!base) throw new Error("DATABASE_URL is required for integration tests (a disposable test database is created from it)");
  const name = `${prefix}_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const server = new URL(base); server.pathname = "/";
  const admin = await mysql.createConnection({ uri: server.toString() });
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const url = new URL(base); url.pathname = `/${name}`;
  await runMigrations(url.toString());
  return {
    url: url.toString(),
    async drop() {
      try { await closeDb(); } finally { await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); await admin.end(); }
    },
  };
}
