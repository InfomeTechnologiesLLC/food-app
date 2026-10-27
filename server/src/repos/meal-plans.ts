import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { mealIngredients, mealPlanDays, mealPlans, meals } from "../db/schema.js";
import { newId } from "../db/ids.js";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export interface MealIngredient { name: string; quantity: number; unit: string; fromPantry: boolean }
export interface MealDoc {
  _id: string; type: MealType; title: string; description: string; prepMinutes: number; calories: number;
  nutrition: { proteinGrams: number; carbsGrams: number; fatGrams: number };
  ingredients: MealIngredient[]; steps: string[]; allergyWarnings: string[];
  eaten: boolean; historyEntryId: string | null;
}
export interface DayDoc { _id: string; day: number; date: string | null; meals: MealDoc[] }
export interface SettingsSnapshot {
  diet: string; allergies: string[]; goal: string; budget: string;
  body: { heightCm: number | null; weightKg: number | null; weightUpdatedAt: Date | null };
  trainingContext: unknown; mealTypes: string[]; maxExtraItems: number | null;
}
/** A meal plan shaped the way the API has always returned it. */
export interface PlanDoc {
  _id: string; userId: string; title: string; status: "active"; startDate: string | null;
  days: DayDoc[]; settingsSnapshot: SettingsSnapshot;
  createdAt: Date; updatedAt: Date; __v: number;
}

type MealInput = Omit<MealDoc, "_id" | "eaten" | "historyEntryId" | "allergyWarnings"> & Partial<Pick<MealDoc, "_id" | "eaten" | "historyEntryId" | "allergyWarnings">>;
export interface PlanInput {
  _id?: string; userId: string; title: string; startDate?: string | null; __v?: number; createdAt?: Date | string;
  days: { _id?: string; day: number; date?: string | null; meals: MealInput[] }[];
  settingsSnapshot: Omit<SettingsSnapshot, "body" | "trainingContext" | "maxExtraItems"> & Partial<Pick<SettingsSnapshot, "body" | "trainingContext" | "maxExtraItems">>;
}

const toDate = (value: Date | string | null | undefined) => (value == null ? null : new Date(value));

/** Builds a complete in-memory plan (with new ids for anything missing). Nothing is saved. */
export function buildPlan(input: PlanInput): PlanDoc {
  const now = new Date();
  const body = input.settingsSnapshot.body;
  return {
    _id: input._id ?? newId(), userId: input.userId, title: input.title, status: "active", startDate: input.startDate ?? null,
    days: input.days.map((day) => ({
      _id: day._id ?? newId(), day: day.day, date: day.date ?? null,
      meals: day.meals.map((meal) => ({
        _id: meal._id ?? newId(), type: meal.type, title: meal.title, description: meal.description, prepMinutes: meal.prepMinutes, calories: meal.calories,
        nutrition: { proteinGrams: meal.nutrition.proteinGrams, carbsGrams: meal.nutrition.carbsGrams, fatGrams: meal.nutrition.fatGrams },
        ingredients: meal.ingredients.map(({ name, quantity, unit, fromPantry }) => ({ name, quantity, unit, fromPantry })),
        steps: [...meal.steps], allergyWarnings: [...(meal.allergyWarnings ?? [])], eaten: meal.eaten ?? false, historyEntryId: meal.historyEntryId ?? null,
      })),
    })),
    settingsSnapshot: {
      diet: input.settingsSnapshot.diet, allergies: [...input.settingsSnapshot.allergies], goal: input.settingsSnapshot.goal, budget: input.settingsSnapshot.budget,
      body: { heightCm: body?.heightCm ?? null, weightKg: body?.weightKg ?? null, weightUpdatedAt: toDate(body?.weightUpdatedAt) },
      trainingContext: input.settingsSnapshot.trainingContext ?? null, mealTypes: [...input.settingsSnapshot.mealTypes], maxExtraItems: input.settingsSnapshot.maxExtraItems ?? null,
    },
    createdAt: toDate(input.createdAt) ?? now, updatedAt: now, __v: input.__v ?? 0,
  };
}

async function load(rows: (typeof mealPlans.$inferSelect)[], conn: Conn): Promise<PlanDoc[]> {
  if (!rows.length) return [];
  const planIds = rows.map((row) => row.id);
  const dayRows = await conn.select().from(mealPlanDays).where(inArray(mealPlanDays.planId, planIds)).orderBy(asc(mealPlanDays.position));
  const mealRows = await conn.select().from(meals).where(inArray(meals.planId, planIds)).orderBy(asc(meals.position));
  const ingredientRows = mealRows.length
    ? await conn.select().from(mealIngredients).where(inArray(mealIngredients.mealId, mealRows.map((meal) => meal.id))).orderBy(asc(mealIngredients.position))
    : [];
  return rows.map((row) => ({
    _id: row.id, userId: row.userId, title: row.title, status: row.status, startDate: row.startDate,
    days: dayRows.filter((day) => day.planId === row.id).map((day) => ({
      _id: day.id, day: day.dayNumber, date: day.date,
      meals: mealRows.filter((meal) => meal.dayId === day.id).map((meal) => ({
        _id: meal.id, type: meal.type, title: meal.title, description: meal.description, prepMinutes: meal.prepMinutes, calories: meal.calories,
        nutrition: { proteinGrams: meal.proteinGrams, carbsGrams: meal.carbsGrams, fatGrams: meal.fatGrams },
        ingredients: ingredientRows.filter((ingredient) => ingredient.mealId === meal.id).map(({ name, quantity, unit, fromPantry }) => ({ name, quantity, unit, fromPantry })),
        steps: meal.steps, allergyWarnings: meal.allergyWarnings, eaten: meal.eaten, historyEntryId: meal.historyEntryId,
      })),
    })),
    settingsSnapshot: {
      diet: row.settingsDiet, allergies: row.settingsAllergies, goal: row.settingsGoal, budget: row.settingsBudget,
      body: { heightCm: row.settingsHeightCm, weightKg: row.settingsWeightKg, weightUpdatedAt: row.settingsWeightUpdatedAt },
      trainingContext: row.settingsTrainingContext, mealTypes: row.settingsMealTypes, maxExtraItems: row.settingsMaxExtraItems,
    },
    createdAt: row.createdAt, updatedAt: row.updatedAt, __v: row.version,
  }));
}

async function insertDays(conn: Conn, plan: PlanDoc) {
  for (const [position, day] of plan.days.entries()) {
    await conn.insert(mealPlanDays).values({ id: day._id, planId: plan._id, position, dayNumber: day.day, date: day.date });
    for (const [mealPosition, meal] of day.meals.entries()) {
      await conn.insert(meals).values({
        id: meal._id, planId: plan._id, dayId: day._id, position: mealPosition, type: meal.type, title: meal.title, description: meal.description,
        prepMinutes: meal.prepMinutes, calories: meal.calories, proteinGrams: meal.nutrition.proteinGrams, carbsGrams: meal.nutrition.carbsGrams,
        fatGrams: meal.nutrition.fatGrams, steps: meal.steps, allergyWarnings: meal.allergyWarnings, eaten: meal.eaten, historyEntryId: meal.historyEntryId,
      });
      if (meal.ingredients.length) {
        await conn.insert(mealIngredients).values(meal.ingredients.map((ingredient, index) => ({ mealId: meal._id, position: index, ...ingredient })));
      }
    }
  }
}

function settingsColumns(plan: PlanDoc) {
  const s = plan.settingsSnapshot;
  return {
    settingsDiet: s.diet, settingsAllergies: s.allergies, settingsGoal: s.goal, settingsBudget: s.budget,
    settingsHeightCm: s.body.heightCm, settingsWeightKg: s.body.weightKg, settingsWeightUpdatedAt: s.body.weightUpdatedAt,
    settingsTrainingContext: s.trainingContext ?? null, settingsMealTypes: s.mealTypes, settingsMaxExtraItems: s.maxExtraItems,
  };
}

export const mealPlanRepo = {
  async findById(id: string, userId?: string, conn: Conn = getDb()) {
    const rows = await conn.select().from(mealPlans).where(userId ? and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)) : eq(mealPlans.id, id));
    return (await load(rows, conn))[0] ?? null;
  },
  async findActive(userId: string, conn: Conn = getDb()) {
    const rows = await conn.select().from(mealPlans).where(and(eq(mealPlans.userId, userId), eq(mealPlans.status, "active")));
    return (await load(rows, conn))[0] ?? null;
  },
  async listActive(userId: string, conn: Conn = getDb()) {
    const rows = await conn.select().from(mealPlans).where(and(eq(mealPlans.userId, userId), eq(mealPlans.status, "active"))).orderBy(desc(mealPlans.createdAt));
    return load(rows, conn);
  },
  /** Saves a new plan with all its days, meals and ingredients. */
  async insert(conn: Conn, plan: PlanDoc) {
    await conn.insert(mealPlans).values({
      id: plan._id, userId: plan.userId, title: plan.title, status: plan.status, startDate: plan.startDate,
      ...settingsColumns(plan), version: plan.__v, createdAt: plan.createdAt,
    });
    await insertDays(conn, plan);
    return (await mealPlanRepo.findById(plan._id, undefined, conn))!;
  },
  /** Rewrites a stored plan from `plan` (title, dates, days, meals) and bumps its revision. */
  async save(conn: Conn, plan: PlanDoc) {
    await conn.update(mealPlans).set({ title: plan.title, status: plan.status, startDate: plan.startDate, ...settingsColumns(plan), version: sql`${mealPlans.version} + 1` })
      .where(eq(mealPlans.id, plan._id));
    await conn.delete(mealPlanDays).where(eq(mealPlanDays.planId, plan._id));
    await insertDays(conn, plan);
    return (await mealPlanRepo.findById(plan._id, undefined, conn))!;
  },
  async delete(conn: Conn, id: string) {
    await conn.delete(mealPlans).where(eq(mealPlans.id, id));
  },
  /** Marks a meal as eaten / not eaten and bumps the plan revision. */
  async setMealEaten(conn: Conn, planId: string, mealId: string, eaten: boolean, historyEntryId: string | null) {
    await conn.update(meals).set({ eaten, historyEntryId }).where(and(eq(meals.id, mealId), eq(meals.planId, planId)));
    await conn.update(mealPlans).set({ version: sql`${mealPlans.version} + 1` }).where(eq(mealPlans.id, planId));
  },
  /** The active plan that contains this meal, if any. */
  async findActiveContainingMeal(userId: string, mealId: string, conn: Conn) {
    const [row] = await conn.select({ planId: meals.planId }).from(meals).innerJoin(mealPlans, eq(mealPlans.id, meals.planId))
      .where(and(eq(meals.id, mealId), eq(mealPlans.userId, userId), eq(mealPlans.status, "active")));
    return row ? mealPlanRepo.findById(row.planId, userId, conn) : null;
  },
  async count(filter: { userId?: string; status?: "active" } = {}, conn: Conn = getDb()) {
    const parts = [filter.userId ? eq(mealPlans.userId, filter.userId) : undefined, filter.status ? eq(mealPlans.status, filter.status) : undefined].filter(Boolean);
    const [row] = await conn.select({ n: count() }).from(mealPlans).where(parts.length ? and(...parts) : undefined);
    return row!.n;
  },
  async listForAdmin(userId: string, offset: number, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(mealPlans).where(eq(mealPlans.userId, userId)).orderBy(desc(mealPlans.createdAt), desc(mealPlans.id)).limit(limit).offset(offset);
    return load(rows, conn);
  },
};
