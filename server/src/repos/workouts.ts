import { and, asc, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { workoutPlanDays, workoutPlanExercises, workoutPlans, workoutSessionExercises, workoutSessionSets, workoutSessions } from "../db/schema.js";
import { newId } from "../db/ids.js";
import { transaction } from "../db/tx.js";

// ───────────────────────────── plans ─────────────────────────────

export interface Prescription { exerciseId: string; sets: number | null; repsMin: number | null; repsMax: number | null; durationSeconds: number | null; restSeconds: number | null }
export interface WorkoutDayDoc { date: string; title: string | null; explanation: string | null; exercises: Prescription[] }
export interface WorkoutPlanDoc {
  _id: string; userId: string; title: string | null; status: "draft" | "active";
  days: WorkoutDayDoc[]; context: unknown; createdAt: Date; updatedAt: Date; __v: number;
}
type DayInput = { date: string; title?: string | null; explanation?: string | null; exercises: (Partial<Prescription> & { exerciseId: string })[] };

async function loadPlans(rows: (typeof workoutPlans.$inferSelect)[], conn: Conn): Promise<WorkoutPlanDoc[]> {
  if (!rows.length) return [];
  const days = await conn.select().from(workoutPlanDays).where(inArray(workoutPlanDays.planId, rows.map((row) => row.id))).orderBy(asc(workoutPlanDays.position));
  const exercises = days.length
    ? await conn.select().from(workoutPlanExercises).where(inArray(workoutPlanExercises.dayId, days.map((day) => day.id))).orderBy(asc(workoutPlanExercises.position))
    : [];
  return rows.map((row) => ({
    _id: row.id, userId: row.userId, title: row.title, status: row.status, context: row.context,
    days: days.filter((day) => day.planId === row.id).map((day) => ({
      date: day.date, title: day.title, explanation: day.explanation,
      exercises: exercises.filter((exercise) => exercise.dayId === day.id)
        .map(({ exerciseId, sets, repsMin, repsMax, durationSeconds, restSeconds }) => ({ exerciseId, sets, repsMin, repsMax, durationSeconds, restSeconds })),
    })),
    createdAt: row.createdAt, updatedAt: row.updatedAt, __v: row.version,
  }));
}

async function insertPlanDays(conn: Conn, planId: string, days: DayInput[]) {
  for (const [position, day] of days.entries()) {
    const [result] = await conn.insert(workoutPlanDays).values({ planId, position, date: day.date, title: day.title ?? null, explanation: day.explanation ?? null });
    if (day.exercises.length) {
      await conn.insert(workoutPlanExercises).values(day.exercises.map((exercise, index) => ({
        dayId: result.insertId, position: index, exerciseId: exercise.exerciseId, sets: exercise.sets ?? null, repsMin: exercise.repsMin ?? null,
        repsMax: exercise.repsMax ?? null, durationSeconds: exercise.durationSeconds ?? null, restSeconds: exercise.restSeconds ?? null,
      })));
    }
  }
}

const planWhere = (id: string, userId?: string) => (userId ? and(eq(workoutPlans.id, id), eq(workoutPlans.userId, userId)) : eq(workoutPlans.id, id));

export const workoutPlanRepo = {
  async listForUser(userId: string, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(workoutPlans).where(eq(workoutPlans.userId, userId)).orderBy(desc(workoutPlans.createdAt), desc(workoutPlans.id)).limit(limit);
    return loadPlans(rows, conn);
  },
  async create(data: { userId: string; title: string | null; status?: "draft" | "active"; days: DayInput[]; context: unknown }, conn?: Conn) {
    const work = async (tx: Conn) => {
      const id = newId();
      await tx.insert(workoutPlans).values({ id, userId: data.userId, title: data.title, status: data.status ?? "draft", context: data.context });
      await insertPlanDays(tx, id, data.days);
      return (await workoutPlanRepo.findById(id, undefined, tx))!;
    };
    return conn ? work(conn) : transaction(work);
  },
  /** `lock` holds the row until the transaction ends. */
  async findById(id: string, userId?: string, conn: Conn = getDb(), options: { lock?: boolean } = {}) {
    const query = conn.select().from(workoutPlans).where(planWhere(id, userId));
    const rows = options.lock ? await query.for("update") : await query;
    return (await loadPlans(rows, conn))[0] ?? null;
  },
  async findActive(userId: string, conn: Conn = getDb(), options: { lock?: boolean } = {}) {
    const query = conn.select().from(workoutPlans).where(and(eq(workoutPlans.userId, userId), eq(workoutPlans.status, "active")));
    const rows = options.lock ? await query.for("update") : await query;
    return (await loadPlans(rows, conn))[0] ?? null;
  },
  /** Replaces title and days only if the plan is still at `revision`. Returns null when it changed meanwhile. */
  async updateContent(id: string, userId: string, revision: number, content: { title: string; days: DayInput[] }) {
    return transaction(async (tx) => {
      const [result] = await tx.update(workoutPlans).set({ title: content.title, version: sql`${workoutPlans.version} + 1` })
        .where(and(eq(workoutPlans.id, id), eq(workoutPlans.userId, userId), eq(workoutPlans.version, revision)));
      if (!result.affectedRows) return null;
      await tx.delete(workoutPlanDays).where(eq(workoutPlanDays.planId, id));
      await insertPlanDays(tx, id, content.days);
      return workoutPlanRepo.findById(id, userId, tx);
    });
  },
  async activate(conn: Conn, id: string) {
    await conn.update(workoutPlans).set({ status: "active", version: sql`${workoutPlans.version} + 1` }).where(eq(workoutPlans.id, id));
    return (await workoutPlanRepo.findById(id, undefined, conn))!;
  },
  async delete(conn: Conn, id: string, userId: string) {
    await conn.delete(workoutPlans).where(planWhere(id, userId));
  },
  async count(filter: { userId?: string; status?: "draft" | "active" } = {}, conn: Conn = getDb()) {
    const parts = [filter.userId ? eq(workoutPlans.userId, filter.userId) : undefined, filter.status ? eq(workoutPlans.status, filter.status) : undefined].filter(Boolean);
    const [row] = await conn.select({ n: count() }).from(workoutPlans).where(parts.length ? and(...parts) : undefined);
    return row!.n;
  },
  async listForAdmin(userId: string, offset: number, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(workoutPlans).where(eq(workoutPlans.userId, userId)).orderBy(desc(workoutPlans.createdAt), desc(workoutPlans.id)).limit(limit).offset(offset);
    return loadPlans(rows, conn);
  },
};

// ───────────────────────────── sessions ─────────────────────────────

export interface SetLog { reps: number | null; weightKg: number | null; durationSeconds: number | null; distanceKm: number | null; status: string | null }
export interface SessionExercise { exerciseId: string | null; restSeconds: number | null; definition: unknown; sets: SetLog[] }
export interface SessionData {
  planId: string | null; scheduledDate: string | null; date: string; timezone: string | null; title: string | null;
  startedAt: string | null; finishedAt: string | null; status: "in_progress" | "finished" | null; notes: string | null; feedback: string | null;
  exercises: SessionExercise[];
}
export interface WorkoutSessionDoc extends SessionData { _id: string; userId: string; revision: number; operationId: string; createdAt: Date; updatedAt: Date; __v: number }

type SessionInput = Partial<Omit<SessionData, "exercises" | "date">> & { date: string; exercises: (Partial<Omit<SessionExercise, "sets">> & { definition: unknown; sets?: Partial<SetLog>[] })[] };

async function loadSessions(rows: (typeof workoutSessions.$inferSelect)[], conn: Conn): Promise<WorkoutSessionDoc[]> {
  if (!rows.length) return [];
  const exercises = await conn.select().from(workoutSessionExercises).where(inArray(workoutSessionExercises.sessionId, rows.map((row) => row.id))).orderBy(asc(workoutSessionExercises.position));
  const sets = exercises.length
    ? await conn.select().from(workoutSessionSets).where(inArray(workoutSessionSets.exerciseRowId, exercises.map((exercise) => exercise.id))).orderBy(asc(workoutSessionSets.position))
    : [];
  return rows.map((row) => ({
    _id: row.id, userId: row.userId, revision: row.revision, operationId: row.operationId, planId: row.planId, scheduledDate: row.scheduledDate,
    date: row.date, timezone: row.timezone, title: row.title, startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null,
    status: row.status, notes: row.notes, feedback: row.feedback,
    exercises: exercises.filter((exercise) => exercise.sessionId === row.id).map((exercise) => ({
      exerciseId: exercise.exerciseId, restSeconds: exercise.restSeconds, definition: exercise.definition,
      sets: sets.filter((set) => set.exerciseRowId === exercise.id).map(({ reps, weightKg, durationSeconds, distanceKm, status }) => ({ reps, weightKg, durationSeconds, distanceKm, status })),
    })),
    createdAt: row.createdAt, updatedAt: row.updatedAt, __v: 0,
  }));
}

const sessionColumns = (data: SessionInput) => ({
  planId: data.planId ?? null, scheduledDate: data.scheduledDate ?? null, date: data.date, timezone: data.timezone ?? null, title: data.title ?? null,
  startedAt: data.startedAt ? new Date(data.startedAt) : null, finishedAt: data.finishedAt ? new Date(data.finishedAt) : null,
  status: data.status ?? null, notes: data.notes ?? null, feedback: data.feedback ?? null,
});

async function insertExercises(conn: Conn, sessionId: string, exercises: SessionInput["exercises"]) {
  for (const [position, exercise] of exercises.entries()) {
    const [result] = await conn.insert(workoutSessionExercises).values({ sessionId, position, exerciseId: exercise.exerciseId ?? null, restSeconds: exercise.restSeconds ?? null, definition: exercise.definition });
    if (exercise.sets?.length) {
      await conn.insert(workoutSessionSets).values(exercise.sets.map((set, index) => ({
        exerciseRowId: result.insertId, position: index, reps: set.reps ?? null, weightKg: set.weightKg ?? null,
        durationSeconds: set.durationSeconds ?? null, distanceKm: set.distanceKm ?? null, status: set.status ?? null,
      })));
    }
  }
}

export const workoutSessionRepo = {
  async findById(id: string, userId?: string, conn: Conn = getDb()) {
    const rows = await conn.select().from(workoutSessions).where(userId ? and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)) : eq(workoutSessions.id, id));
    return (await loadSessions(rows, conn))[0] ?? null;
  },
  /** Inserts a new session (throws a duplicate-key error if the id already exists). */
  async create(data: SessionInput & { _id: string; userId: string; revision: number; operationId: string }, conn?: Conn) {
    const work = async (tx: Conn) => {
      await tx.insert(workoutSessions).values({ id: data._id, userId: data.userId, revision: data.revision, operationId: data.operationId, ...sessionColumns(data) });
      await insertExercises(tx, data._id, data.exercises);
      return (await workoutSessionRepo.findById(data._id, data.userId, tx))!;
    };
    return conn ? work(conn) : transaction(work);
  },
  /** Saves `data` only if the stored revision is still `baseRevision`; returns null otherwise. */
  async updateIfRevision(id: string, userId: string, baseRevision: number, data: SessionInput & { operationId: string }) {
    return transaction(async (tx) => {
      const [result] = await tx.update(workoutSessions).set({ ...sessionColumns(data), operationId: data.operationId, revision: sql`${workoutSessions.revision} + 1` })
        .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId), eq(workoutSessions.revision, baseRevision)));
      if (!result.affectedRows) return null;
      await tx.delete(workoutSessionExercises).where(eq(workoutSessionExercises.sessionId, id));
      await insertExercises(tx, id, data.exercises);
      return workoutSessionRepo.findById(id, userId, tx);
    });
  },
  /** Newest first by date, then id; continues after `cursor` when given. */
  async page(userId: string, options: { date?: string; cursor?: { date: string; id: string }; limit: number }, conn: Conn = getDb()) {
    const after = options.cursor ? or(lt(workoutSessions.date, options.cursor.date), and(eq(workoutSessions.date, options.cursor.date), lt(workoutSessions.id, options.cursor.id))) : undefined;
    const rows = await conn.select().from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), options.date ? eq(workoutSessions.date, options.date) : undefined, after))
      .orderBy(desc(workoutSessions.date), desc(workoutSessions.id)).limit(options.limit);
    return loadSessions(rows, conn);
  },
  async listByStart(userId: string, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(workoutSessions).where(eq(workoutSessions.userId, userId)).orderBy(desc(workoutSessions.startedAt)).limit(limit);
    return loadSessions(rows, conn);
  },
  async count(userId?: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ n: count() }).from(workoutSessions).where(userId ? eq(workoutSessions.userId, userId) : undefined);
    return row!.n;
  },
  async listForAdmin(userId: string, offset: number, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(workoutSessions).where(eq(workoutSessions.userId, userId)).orderBy(desc(workoutSessions.createdAt), desc(workoutSessions.id)).limit(limit).offset(offset);
    return loadSessions(rows, conn);
  },
};
