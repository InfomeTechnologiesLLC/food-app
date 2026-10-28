import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { plannedDays } from "../db/schema.js";
import { pastPlannedDays, type PlannedKind } from "../lib/planned-days.js";

export const plannedDayRepo = {
  /**
   * Saves the days of an outgoing plan that are already over. Call it inside the same
   * transaction that replaces or deletes the plan. A later save for the same day wins.
   */
  async recordPast(conn: Conn, userId: string, kind: PlannedKind, days: { date: string | null; planned: number }[], today: string) {
    const rows = pastPlannedDays(days, today);
    if (!rows.length) return;
    await conn.insert(plannedDays).values(rows.map((row) => ({ userId, kind, ...row })))
      .onDuplicateKeyUpdate({ set: { planned: sql`values(${plannedDays.planned})` } });
  },
  /** Oldest first, both ends inclusive. */
  async list(userId: string, from: string, to: string, conn: Conn = getDb()) {
    return conn.select({ kind: plannedDays.kind, date: plannedDays.date, planned: plannedDays.planned })
      .from(plannedDays)
      .where(and(eq(plannedDays.userId, userId), gte(plannedDays.date, from), lte(plannedDays.date, to)))
      .orderBy(asc(plannedDays.date), asc(plannedDays.kind));
  },
};