import { and, asc, eq } from "drizzle-orm";
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
  /** One day's drinks, oldest first, and their total. */
  async day(userId: string, date: string, conn: Conn = getDb()): Promise<WaterDay> {
    const rows = await conn.select({ _id: waterLogs.id, amountMl: waterLogs.amountMl, recordedAt: waterLogs.recordedAt })
      .from(waterLogs).where(and(eq(waterLogs.userId, userId), eq(waterLogs.date, date))).orderBy(asc(waterLogs.recordedAt), asc(waterLogs.id));
    return { date, totalMl: rows.reduce((n, r) => n + r.amountMl, 0), entries: rows };
  },
};
