import { and, count, eq, gt, lte } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { adminAccounts, adminSessions } from "../db/schema.js";
import { newId } from "../db/ids.js";

export interface AdminAccountDoc { _id: string; email: string; passwordHash: string }
export interface AdminSessionDoc { _id: string; adminId: string; tokenHash: string; expiresAt: Date }

export const adminAccountRepo = {
  async findByEmail(email: string, conn: Conn = getDb()): Promise<AdminAccountDoc | null> {
    const [row] = await conn.select().from(adminAccounts).where(eq(adminAccounts.email, email.trim().toLowerCase())).limit(1);
    return row ? { _id: row.id, email: row.email, passwordHash: row.passwordHash } : null;
  },
  async findEmailById(id: string, conn: Conn = getDb()): Promise<{ email: string } | null> {
    const [row] = await conn.select({ email: adminAccounts.email }).from(adminAccounts).where(eq(adminAccounts.id, id)).limit(1);
    return row ?? null;
  },
  async create(data: { email: string; passwordHash: string }, conn: Conn = getDb()) {
    const id = newId();
    await conn.insert(adminAccounts).values({ id, email: data.email.trim().toLowerCase(), passwordHash: data.passwordHash });
    return id;
  },
  async count(conn: Conn = getDb()) {
    const [row] = await conn.select({ n: count() }).from(adminAccounts);
    return row!.n;
  },
};

export const adminSessionRepo = {
  async create(data: { adminId: string; tokenHash: string; expiresAt: Date }, conn: Conn = getDb()): Promise<AdminSessionDoc> {
    const id = newId();
    await conn.insert(adminSessions).values({ id, ...data });
    // MySQL doesn't expire rows by itself, so expired sessions are cleaned up on login.
    await conn.delete(adminSessions).where(lte(adminSessions.expiresAt, new Date()));
    return { _id: id, ...data };
  },
  async findValid(tokenHash: string, now: Date, conn: Conn = getDb()): Promise<AdminSessionDoc | null> {
    const [row] = await conn.select().from(adminSessions).where(and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, now))).limit(1);
    return row ? { _id: row.id, adminId: row.adminId, tokenHash: row.tokenHash, expiresAt: row.expiresAt } : null;
  },
  async findByTokenHash(tokenHash: string, conn: Conn = getDb()): Promise<AdminSessionDoc | null> {
    const [row] = await conn.select().from(adminSessions).where(eq(adminSessions.tokenHash, tokenHash)).limit(1);
    return row ? { _id: row.id, adminId: row.adminId, tokenHash: row.tokenHash, expiresAt: row.expiresAt } : null;
  },
  async setExpiry(id: string, expiresAt: Date, conn: Conn = getDb()) {
    await conn.update(adminSessions).set({ expiresAt }).where(eq(adminSessions.id, id));
  },
  async delete(id: string, conn: Conn = getDb()) {
    await conn.delete(adminSessions).where(eq(adminSessions.id, id));
  },
};
