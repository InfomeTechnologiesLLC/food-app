import { desc, eq } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { weightLogs } from "../db/schema.js";
import { newId } from "../db/ids.js";

export interface WeightLog { date: string; weightKg: number; recordedAt: Date }

export const weightRepo = {
  /** One weigh-in per day: logging the same date again replaces the earlier value. */
  async upsert(userId: string, date: string, weightKg: number, conn: Conn = getDb()) {
    const recordedAt = new Date();
    await conn.insert(weightLogs).values({ id: newId(), userId, date, weightKg, recordedAt })
      .onDuplicateKeyUpdate({ set: { weightKg, recordedAt } });
  },
  /** Newest date first. */
  async list(userId: string, limit: number, conn: Conn = getDb()): Promise<WeightLog[]> {
    return conn.select({ date: weightLogs.date, weightKg: weightLogs.weightKg, recordedAt: weightLogs.recordedAt })
      .from(weightLogs).where(eq(weightLogs.userId, userId)).orderBy(desc(weightLogs.date)).limit(limit);
  },
};
