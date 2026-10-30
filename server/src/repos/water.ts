import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { waterLogs } from "../db/schema.js";
import { newId } from "../db/ids.js";

export interface WaterEntry { _id: string; amountMl: number; recordedAt: Date }
export interface WaterDay { date: string; totalMl: number; entries: WaterEntry[] }

export const waterRepo = {
  async add(userId: string, date: string, amountMl: number, conn: Conn = getDb()) {
    await conn.insert(waterLogs).values({ id: newId(), userId, date, amountMl, recordedAt: new Date() });
  },
  /** Removes one drink. Returns its date, or null when it doesn't exist or isn't the user's. */
  async remove(userId: string, id: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ date: waterLogs.date }).from(waterLogs).where(and(eq(waterLogs.id, id), eq(waterLogs.userId, userId)));
    if (!row) return null;
    await conn.delete(waterLogs).where(and(eq(waterLogs.id, id), eq(waterLogs.userId, userId)));
    return row.date;
  },
  /** Total per day between two dates (inclusive); days without water are left out. */
  async totals(userId: string, from: string, to: string, conn: Conn = getDb()) {
    return conn.select({ date: waterLogs.date, totalMl: sql<number>`sum(${waterLogs.amountMl})`.mapWith(Number) })
      .from(waterLogs).where(and(eq(waterLogs.userId, userId), gte(waterLogs.date, from), lte(waterLogs.date, to)))
      .groupBy(waterLogs.date).orderBy(asc(waterLogs.date));
  },
  /** One day's drinks, oldest first, and their total. */
  async day(userId: string, date: string, conn: Conn = getDb()): Promise<WaterDay> {
    const rows = await conn.select({ _id: waterLogs.id, amountMl: waterLogs.amountMl, recordedAt: waterLogs.recordedAt })
      .from(waterLogs).where(and(eq(waterLogs.userId, userId), eq(waterLogs.date, date))).orderBy(asc(waterLogs.recordedAt), asc(waterLogs.id));
    return { date, totalMl: rows.reduce((n, r) => n + r.amountMl, 0), entries: rows };
  },
};
