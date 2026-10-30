import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { periodCheckins, periodLogs, PAIN_LEVELS } from "../db/schema.js";
import { newId } from "../db/ids.js";
import type { PeriodLog } from "../lib/period.js";

export type Pain = (typeof PAIN_LEVELS)[number];

export const periodRepo = {
  /** Newest first */
  async list(userId: string, limit = 24, conn: Conn = getDb()): Promise<PeriodLog[]> {
    return conn.select({ _id: periodLogs.id, startDate: periodLogs.startDate, endDate: periodLogs.endDate })
      .from(periodLogs).where(eq(periodLogs.userId, userId)).orderBy(desc(periodLogs.startDate)).limit(limit);
  },
  async find(userId: string, id: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ _id: periodLogs.id, startDate: periodLogs.startDate, endDate: periodLogs.endDate })
      .from(periodLogs).where(and(eq(periodLogs.id, id), eq(periodLogs.userId, userId)));
    return row ?? null;
  },
  /** Adds a period, or updates the end day when one with the same start already exists. */
  async upsert(userId: string, startDate: string, endDate: string | null, conn: Conn = getDb()) {
    await conn.insert(periodLogs).values({ id: newId(), userId, startDate, endDate }).onDuplicateKeyUpdate({ set: { endDate } });
  },
  async update(userId: string, id: string, values: { startDate: string; endDate: string | null }, conn: Conn = getDb()) {
    await conn.update(periodLogs).set(values).where(and(eq(periodLogs.id, id), eq(periodLogs.userId, userId)));
  },
  async remove(userId: string, id: string, conn: Conn = getDb()) {
    const [result] = await conn.delete(periodLogs).where(and(eq(periodLogs.id, id), eq(periodLogs.userId, userId)));
    return result.affectedRows > 0;
  },
  async setPain(userId: string, date: string, pain: Pain, conn: Conn = getDb()) {
    await conn.insert(periodCheckins).values({ id: newId(), userId, date, pain, recordedAt: new Date() })
      .onDuplicateKeyUpdate({ set: { pain, recordedAt: new Date() } });
  },
  async pains(userId: string, from: string, to: string, conn: Conn = getDb()) {
    return conn.select({ date: periodCheckins.date, pain: periodCheckins.pain }).from(periodCheckins)
      .where(and(eq(periodCheckins.userId, userId), gte(periodCheckins.date, from), lte(periodCheckins.date, to)));
  },
};
