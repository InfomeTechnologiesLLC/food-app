import { and, asc, count, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { foodHistory, foodHistoryConsumed } from "../db/schema.js";
import type { MealDoc } from "./meal-plans.js";
import type { PantryCategory, StockSource } from "../domain/pantry.js";

/** What eating a meal took from the pantry, so undo can put it back. */
export interface Consumed {
  ingredientKey: string; batchId: string; name: string; category: PantryCategory;
  amount: number; unit: string; expiryDate: Date | null; source: StockSource;
}
export interface HistoryEntry {
  _id: string; userId: string; mealId: string; sourcePlanId: string; sourcePlanTitle: string;
  date: string; recordedAt: Date; reversed: boolean; reversedAt: Date | null; meal: MealDoc;
  consumed?: Consumed[]; __v: number;
}
type Row = typeof foodHistory.$inferSelect;

function toEntry(row: Row): HistoryEntry {
  return {
    _id: row.id, userId: row.userId, mealId: row.mealId, sourcePlanId: row.sourcePlanId, sourcePlanTitle: row.sourcePlanTitle,
    date: row.date, recordedAt: row.recordedAt, reversed: row.reversed, reversedAt: row.reversedAt,
    meal: {
      _id: row.mealId, type: row.mealType, title: row.mealTitle, description: row.mealDescription, prepMinutes: row.mealPrepMinutes, calories: row.mealCalories,
      nutrition: { proteinGrams: row.mealProteinGrams, carbsGrams: row.mealCarbsGrams, fatGrams: row.mealFatGrams },
      ingredients: row.mealIngredients, steps: row.mealSteps, allergyWarnings: row.mealAllergyWarnings, eaten: true, historyEntryId: row.id,
    },
    __v: 0,
  };
}

async function attachConsumed(entries: HistoryEntry[], conn: Conn) {
  if (!entries.length) return entries;
  const rows = await conn.select().from(foodHistoryConsumed).where(inArray(foodHistoryConsumed.entryId, entries.map((entry) => entry._id))).orderBy(asc(foodHistoryConsumed.position));
  for (const entry of entries) {
    entry.consumed = rows.filter((row) => row.entryId === entry._id)
      .map(({ ingredientKey, batchId, name, category, amount, unit, expiryDate, source }) => ({ ingredientKey, batchId, name, category, amount, unit, expiryDate, source }));
  }
  return entries;
}

export interface HistoryFilter { userId?: string; reversed?: boolean; date?: string }
const where = (filter: HistoryFilter): SQL | undefined => {
  const parts = [
    filter.userId ? eq(foodHistory.userId, filter.userId) : undefined,
    filter.reversed !== undefined ? eq(foodHistory.reversed, filter.reversed) : undefined,
    filter.date ? eq(foodHistory.date, filter.date) : undefined,
  ].filter((part): part is SQL => Boolean(part));
  return parts.length ? and(...parts) : undefined;
};

export const foodHistoryRepo = {
  async create(conn: Conn, data: { _id: string; userId: string; mealId: string; sourcePlanId: string; sourcePlanTitle: string; date: string; recordedAt: Date; meal: Omit<MealDoc, "_id" | "eaten" | "historyEntryId">; consumed: Consumed[] }) {
    const { meal } = data;
    await conn.insert(foodHistory).values({
      id: data._id, userId: data.userId, mealId: data.mealId, sourcePlanId: data.sourcePlanId, sourcePlanTitle: data.sourcePlanTitle,
      date: data.date, recordedAt: data.recordedAt, mealType: meal.type, mealTitle: meal.title, mealDescription: meal.description,
      mealPrepMinutes: meal.prepMinutes, mealCalories: meal.calories, mealProteinGrams: meal.nutrition.proteinGrams, mealCarbsGrams: meal.nutrition.carbsGrams,
      mealFatGrams: meal.nutrition.fatGrams, mealIngredients: meal.ingredients.map(({ name, quantity, unit, fromPantry }) => ({ name, quantity, unit, fromPantry })),
      mealSteps: meal.steps, mealAllergyWarnings: meal.allergyWarnings ?? [],
    });
    if (data.consumed.length) {
      await conn.insert(foodHistoryConsumed).values(data.consumed.map((item, position) => ({ entryId: data._id, position, ...item })));
    }
  },
  /** One entry; `withConsumed` also loads what it took from the pantry. `lock` holds the row until the transaction ends. */
  async findById(id: string, userId: string, conn: Conn = getDb(), options: { withConsumed?: boolean; lock?: boolean } = {}) {
    const query = conn.select().from(foodHistory).where(and(eq(foodHistory.id, id), eq(foodHistory.userId, userId)));
    const [row] = options.lock ? await query.for("update") : await query;
    if (!row) return null;
    const entry = toEntry(row);
    return options.withConsumed ? (await attachConsumed([entry], conn))[0]! : entry;
  },
  async findOne(filter: HistoryFilter, conn: Conn = getDb(), options: { withConsumed?: boolean } = {}) {
    const [row] = await conn.select().from(foodHistory).where(where(filter)).orderBy(asc(foodHistory.recordedAt), asc(foodHistory.id)).limit(1);
    if (!row) return null;
    const entry = toEntry(row);
    return options.withConsumed ? (await attachConsumed([entry], conn))[0]! : entry;
  },
  /** Live entries for one day (used to keep today's eaten meals when a plan is replaced). */
  async list(filter: HistoryFilter, conn: Conn = getDb()) {
    return (await conn.select().from(foodHistory).where(where(filter)).orderBy(asc(foodHistory.recordedAt), asc(foodHistory.id))).map(toEntry);
  },
  /** Newest first; continues after `cursor` (date + id) when given. */
  async page(filter: HistoryFilter, cursor: { date: string; id: string } | undefined, limit: number, conn: Conn = getDb()) {
    const after = cursor ? or(lt(foodHistory.date, cursor.date), and(eq(foodHistory.date, cursor.date), lt(foodHistory.id, cursor.id))) : undefined;
    const rows = await conn.select().from(foodHistory).where(and(where(filter), after)).orderBy(desc(foodHistory.date), desc(foodHistory.id)).limit(limit);
    return rows.map(toEntry);
  },
  /** Meals, calories and macros per day, summed by MySQL. */
  async totalsByDate(filter: HistoryFilter, dates: string[], conn: Conn = getDb()) {
    if (!dates.length) return [];
    return conn.select({
      date: foodHistory.date,
      meals: sql<number>`count(*)`.mapWith(Number),
      calories: sql<number>`sum(${foodHistory.mealCalories})`.mapWith(Number),
      proteinGrams: sql<number>`sum(${foodHistory.mealProteinGrams})`.mapWith(Number),
      carbsGrams: sql<number>`sum(${foodHistory.mealCarbsGrams})`.mapWith(Number),
      fatGrams: sql<number>`sum(${foodHistory.mealFatGrams})`.mapWith(Number),
    }).from(foodHistory).where(and(where(filter), inArray(foodHistory.date, dates))).groupBy(foodHistory.date);
  },
  async markReversed(conn: Conn, id: string) {
    await conn.update(foodHistory).set({ reversed: true, reversedAt: new Date() }).where(eq(foodHistory.id, id));
  },
  async count(filter: HistoryFilter = {}, conn: Conn = getDb()) {
    const [row] = await conn.select({ n: count() }).from(foodHistory).where(where(filter));
    return row!.n;
  },
  async listForAdmin(userId: string, offset: number, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(foodHistory).where(eq(foodHistory.userId, userId)).orderBy(desc(foodHistory.recordedAt), desc(foodHistory.id)).limit(limit).offset(offset);
    return attachConsumed(rows.map(toEntry), conn);
  },
};
