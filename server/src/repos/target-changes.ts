import { and, desc, eq } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { targetChanges, users } from "../db/schema.js";
import { newId } from "../db/ids.js";

export interface TargetChange { _id: string; date: string; deltaKcal: number; adjustmentAfter: number; reason: string }

export const targetChangeRepo = {
  /** Saves a check-in: always moves `lastCheckIn`, and records a history row when calories changed. */
  async record(conn: Conn, userId: string, date: string, deltaKcal: number, adjustmentAfter: number, reason: string) {
    await conn.update(users).set({ lastCheckIn: date, calorieAdjustment: adjustmentAfter }).where(eq(users.id, userId));
    if (deltaKcal !== 0) await conn.insert(targetChanges).values({ id: newId(), userId, date, deltaKcal, adjustmentAfter, reason });
  },
  /** Newest first. */
  async list(userId: string, limit = 20, conn: Conn = getDb()): Promise<TargetChange[]> {
    return conn.select({ _id: targetChanges.id, date: targetChanges.date, deltaKcal: targetChanges.deltaKcal, adjustmentAfter: targetChanges.adjustmentAfter, reason: targetChanges.reason })
      .from(targetChanges).where(and(eq(targetChanges.userId, userId))).orderBy(desc(targetChanges.date), desc(targetChanges.createdAt)).limit(limit);
  },
};
