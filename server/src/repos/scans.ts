import { and, count, desc, eq } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { scans } from "../db/schema.js";
import { newId } from "../db/ids.js";

type Row = typeof scans.$inferSelect;
export interface ScanDoc { _id: string; userId: string; type: Row["type"]; aiItems: unknown; status: Row["status"]; confirmedCount: number | null; createdAt: Date; updatedAt: Date; __v: number }
const toScan = (row: Row): ScanDoc => ({ _id: row.id, userId: row.userId, type: row.type, aiItems: row.aiItems, status: row.status, confirmedCount: row.confirmedCount, createdAt: row.createdAt, updatedAt: row.updatedAt, __v: 0 });

export const scanRepo = {
  async create(data: { userId: string; type: Row["type"]; aiItems?: unknown }, conn: Conn = getDb()) {
    const id = newId();
    await conn.insert(scans).values({ id, userId: data.userId, type: data.type, aiItems: data.aiItems ?? [] });
    return id;
  },
  /** `lock` holds the row until the transaction ends, so two confirmations cannot run at once. */
  async findById(id: string, userId?: string, conn: Conn = getDb(), options: { lock?: boolean } = {}) {
    const query = conn.select().from(scans).where(userId ? and(eq(scans.id, id), eq(scans.userId, userId)) : eq(scans.id, id));
    const [row] = options.lock ? await query.for("update") : await query;
    return row ? toScan(row) : null;
  },
  async markConfirmed(conn: Conn, id: string, confirmedCount: number) {
    await conn.update(scans).set({ status: "confirmed", confirmedCount }).where(eq(scans.id, id));
  },
  async count(userId?: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ n: count() }).from(scans).where(userId ? eq(scans.userId, userId) : undefined);
    return row!.n;
  },
  async listForAdmin(userId: string, offset: number, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(scans).where(eq(scans.userId, userId)).orderBy(desc(scans.createdAt), desc(scans.id)).limit(limit).offset(offset);
    return rows.map(toScan);
  },
};
