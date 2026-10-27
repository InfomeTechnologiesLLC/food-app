import { and, count, desc, eq, like, lt, gt, ne, sql, type SQL } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { users } from "../db/schema.js";
import { newId } from "../db/ids.js";

type Row = typeof users.$inferSelect;
export type Counter = "scansThisMonth" | "plansThisMonth";

/** A user shaped the way the API has always returned it. */
export interface UserDoc {
  _id: string; email: string; passwordHash: string; plan: "free" | "plus";
  preferences: { diet: string; allergies: string[]; goal: string; budget: string };
  body: { heightCm: number | null; weightKg: number | null; weightUpdatedAt: Date | null };
  training: { enabled: boolean; goal: Row["trainingGoal"]; experience: Row["trainingExperience"]; equipment: string[]; weekdays: number[]; sessionMinutes: number; excludedExercises: string[] };
  usage: { period: string; scansThisMonth: number; plansThisMonth: number };
  pushTokens: string[]; scheduleRevision: number; onboarded: boolean;
  createdAt: Date; updatedAt: Date; __v: number;
}

export function toUser(row: Row): UserDoc {
  return {
    _id: row.id, email: row.email, passwordHash: row.passwordHash, plan: row.plan,
    preferences: { diet: row.diet, allergies: row.allergies, goal: row.goal, budget: row.budget },
    body: { heightCm: row.heightCm, weightKg: row.weightKg, weightUpdatedAt: row.weightUpdatedAt },
    training: { enabled: row.trainingEnabled, goal: row.trainingGoal, experience: row.trainingExperience, equipment: row.trainingEquipment,
      weekdays: row.trainingWeekdays, sessionMinutes: row.trainingSessionMinutes, excludedExercises: row.trainingExcludedExercises },
    usage: { period: row.usagePeriod, scansThisMonth: row.scansThisMonth, plansThisMonth: row.plansThisMonth },
    pushTokens: row.pushTokens, scheduleRevision: row.scheduleRevision, onboarded: row.onboarded,
    createdAt: row.createdAt, updatedAt: row.updatedAt, __v: 0,
  };
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const counterColumn = { scansThisMonth: users.scansThisMonth, plansThisMonth: users.plansThisMonth } as const;
const counterKey = { scansThisMonth: "scansThisMonth", plansThisMonth: "plansThisMonth" } as const;

export interface UserFilter { plan?: "free" | "plus"; onboarded?: boolean; id?: string; emailContains?: string }
function where(filter: UserFilter = {}): SQL | undefined {
  const parts: SQL[] = [];
  if (filter.plan) parts.push(eq(users.plan, filter.plan));
  if (filter.onboarded !== undefined) parts.push(eq(users.onboarded, filter.onboarded));
  if (filter.id) parts.push(eq(users.id, filter.id));
  if (filter.emailContains) parts.push(like(users.email, `%${filter.emailContains.replace(/[\\%_]/g, "\\$&")}%`));
  return parts.length ? and(...parts) : undefined;
}

export interface TrainingFields { enabled: boolean; goal: Row["trainingGoal"]; experience: Row["trainingExperience"]; equipment: string[]; weekdays: number[]; sessionMinutes: number; excludedExercises: string[] }

export const userRepo = {
  async findById(id: string, conn: Conn = getDb()): Promise<UserDoc | null> {
    const [row] = await conn.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toUser(row) : null;
  },
  async findByEmail(email: string, conn: Conn = getDb()): Promise<UserDoc | null> {
    const [row] = await conn.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
    return row ? toUser(row) : null;
  },
  async emailExists(email: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ id: users.id }).from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
    return Boolean(row);
  },
  async exists(id: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    return Boolean(row);
  },
  async create(data: { email: string; passwordHash: string; id?: string } & Partial<Pick<Row, "plan" | "onboarded" | "diet" | "pushTokens">>, conn: Conn = getDb()) {
    const id = data.id ?? newId();
    await conn.insert(users).values({ ...data, id, email: normalizeEmail(data.email) });
    return (await userRepo.findById(id, conn))!;
  },
  async updatePreferences(id: string, prefs: Partial<UserDoc["preferences"]>, conn: Conn = getDb()) {
    const [result] = await conn.update(users).set({ ...prefs, onboarded: true }).where(eq(users.id, id));
    return result.affectedRows ? userRepo.findById(id, conn) : null;
  },
  async updateBody(id: string, body: Partial<UserDoc["body"]>, conn: Conn = getDb()) {
    const [result] = await conn.update(users).set({ ...body, updatedAt: new Date() }).where(eq(users.id, id));
    return result.affectedRows ? userRepo.findById(id, conn) : null;
  },
  async updateTraining(id: string, training: TrainingFields, conn: Conn = getDb()) {
    const [result] = await conn.update(users).set({
      trainingEnabled: training.enabled, trainingGoal: training.goal, trainingExperience: training.experience, trainingEquipment: training.equipment,
      trainingWeekdays: training.weekdays, trainingSessionMinutes: training.sessionMinutes, trainingExcludedExercises: training.excludedExercises,
    }).where(eq(users.id, id));
    return result.affectedRows ? userRepo.findById(id, conn) : null;
  },
  /** Seed helper: set preferences, body, training and onboarded in one go. */
  async setProfile(id: string, profile: { preferences: UserDoc["preferences"]; body: UserDoc["body"]; training: TrainingFields; onboarded: boolean }, conn: Conn = getDb()) {
    await userRepo.updateTraining(id, profile.training, conn);
    await conn.update(users).set({ ...profile.preferences, ...profile.body, onboarded: profile.onboarded }).where(eq(users.id, id));
    return (await userRepo.findById(id, conn))!;
  },
  /** Resets every profile field to its default, keeping only id, email, password hash and createdAt. */
  async resetToDefaults(id: string, conn: Conn = getDb()) {
    await conn.update(users).set({
      plan: "free", diet: "none", allergies: [], goal: "balanced", budget: "medium", heightCm: null, weightKg: null, weightUpdatedAt: null,
      trainingEnabled: false, trainingGoal: "general_fitness", trainingExperience: "beginner", trainingEquipment: [], trainingWeekdays: [1, 3, 5],
      trainingSessionMinutes: 30, trainingExcludedExercises: [], usagePeriod: new Date().toISOString().slice(0, 7), scansThisMonth: 0, plansThisMonth: 0,
      pushTokens: [], scheduleRevision: 0, onboarded: false,
    }).where(eq(users.id, id));
  },
  /**
   * Locks the user's row until the transaction ends and bumps its schedule revision.
   * Every write to a user's plans, history or stock goes through this, so concurrent
   * requests for the same user run one after another. Returns false if the user is missing.
   */
  async bumpScheduleRevision(id: string, conn: Conn) {
    const [result] = await conn.update(users).set({ scheduleRevision: sql`${users.scheduleRevision} + 1` }).where(eq(users.id, id));
    return result.affectedRows > 0;
  },
  /** Locks the user's row (SELECT ... FOR UPDATE) until the transaction ends. */
  async lock(id: string, conn: Conn) {
    const [row] = await conn.select({ id: users.id }).from(users).where(eq(users.id, id)).for("update");
    return Boolean(row);
  },

  // ── monthly usage ──
  async resetUsageIfStale(id: string, period: string, conn: Conn = getDb()) {
    await conn.update(users).set({ usagePeriod: period, scansThisMonth: 0, plansThisMonth: 0 }).where(and(eq(users.id, id), ne(users.usagePeriod, period)));
  },
  /** Atomically adds one to `counter` when it is below `limit` (or always when limit is Infinity). */
  async incrementUsage(id: string, counter: Counter, limit: number, conn: Conn = getDb()) {
    const column = counterColumn[counter];
    const condition = Number.isFinite(limit) ? and(eq(users.id, id), lt(column, limit)) : eq(users.id, id);
    const [result] = await conn.update(users).set({ [counterKey[counter]]: sql`${column} + 1` }).where(condition);
    return result.affectedRows === 1;
  },
  async decrementUsage(id: string, counter: Counter, conn: Conn = getDb()) {
    const column = counterColumn[counter];
    await conn.update(users).set({ [counterKey[counter]]: sql`${column} - 1` }).where(and(eq(users.id, id), gt(column, 0)));
  },

  // ── admin ──
  async list(filter: UserFilter, offset: number, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(users).where(where(filter)).orderBy(desc(users.createdAt), desc(users.id)).limit(limit).offset(offset);
    return rows.map(toUser);
  },
  async count(filter: UserFilter = {}, conn: Conn = getDb()) {
    const [row] = await conn.select({ n: count() }).from(users).where(where(filter));
    return row!.n;
  },
  async all(conn: Conn = getDb()) {
    return (await conn.select().from(users)).map(toUser);
  },
};
