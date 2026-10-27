import { and, asc, count, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb, type Conn } from "../db/client.js";
import { pantryBatches, pantryIngredients, stockOperationItems, stockOperations } from "../db/schema.js";
import { newId } from "../db/ids.js";
import type { IngredientStock, PantryCategory, StockBatch, StockInput, StockSource } from "../domain/pantry.js";
import { normalize } from "../lib/ingredients.js";

type IngredientRow = typeof pantryIngredients.$inferSelect;
type BatchRow = typeof pantryBatches.$inferSelect;

const toBatch = (row: BatchRow): StockBatch => ({ _id: row.id, quantity: row.quantity, unit: row.unit, expiryDate: row.expiryDate, source: row.source });

async function withBatches(rows: IngredientRow[], conn: Conn): Promise<IngredientStock[]> {
  if (!rows.length) return [];
  const batches = await conn.select().from(pantryBatches)
    .where(inArray(pantryBatches.ingredientId, rows.map((row) => row.id)))
    .orderBy(asc(pantryBatches.createdAt), asc(pantryBatches.id));
  return rows.map((row) => ({
    _id: row.id, userId: row.userId, key: row.key, name: row.name, category: row.category,
    batches: batches.filter((batch) => batch.ingredientId === row.id).map(toBatch),
    createdAt: row.createdAt, updatedAt: row.updatedAt, __v: row.version,
  }));
}

const touch = (id: string, conn: Conn) =>
  conn.update(pantryIngredients).set({ version: sql`${pantryIngredients.version} + 1` }).where(eq(pantryIngredients.id, id));

export interface NewBatch { _id?: string; quantity: number; unit: string; expiryDate: Date | null; source: StockSource }

export const pantryRepo = {
  /** The user's ingredients (alphabetical) with their batches (oldest first). */
  async list(userId: string, conn: Conn = getDb()) {
    const rows = await conn.select().from(pantryIngredients).where(eq(pantryIngredients.userId, userId)).orderBy(asc(pantryIngredients.name));
    return withBatches(rows, conn);
  },
  async exists(userId: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ id: pantryIngredients.id }).from(pantryIngredients).where(eq(pantryIngredients.userId, userId)).limit(1);
    return Boolean(row);
  },
  async count(userId?: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ n: count() }).from(pantryIngredients).where(userId ? eq(pantryIngredients.userId, userId) : undefined);
    return row!.n;
  },
  async findById(id: string, userId: string, conn: Conn = getDb()) {
    const rows = await conn.select().from(pantryIngredients).where(and(eq(pantryIngredients.id, id), eq(pantryIngredients.userId, userId)));
    return (await withBatches(rows, conn))[0] ?? null;
  },
  async findByKey(userId: string, key: string, conn: Conn = getDb()) {
    const rows = await conn.select().from(pantryIngredients).where(and(eq(pantryIngredients.userId, userId), eq(pantryIngredients.key, normalize(key))));
    return (await withBatches(rows, conn))[0] ?? null;
  },
  /** Returns the id of the user's ingredient with this key, creating it if needed (name/category are only used on create). */
  async ensureIngredient(conn: Conn, input: { userId: string; key: string; name: string; category: PantryCategory }) {
    // Ingredient identity (user + normalized key) is a database invariant.
    const data = { ...input, key: normalize(input.key), name: normalize(input.name) };
    await conn.insert(pantryIngredients).values({ id: newId(), ...data }).onDuplicateKeyUpdate({ set: { id: sql`${pantryIngredients.id}` } });
    const [row] = await conn.select({ id: pantryIngredients.id }).from(pantryIngredients)
      .where(and(eq(pantryIngredients.userId, data.userId), eq(pantryIngredients.key, data.key))).for("update");
    return row!.id;
  },
  /** Creates an ingredient with its batches (fails on a duplicate user/key). */
  async create(conn: Conn, data: { userId: string; key: string; name: string; category: PantryCategory; batches: NewBatch[] }) {
    const id = newId();
    await conn.insert(pantryIngredients).values({ id, userId: data.userId, key: normalize(data.key), name: normalize(data.name), category: data.category });
    for (const batch of data.batches) await pantryRepo.addBatch(conn, id, batch);
    return id;
  },
  async addBatch(conn: Conn, ingredientId: string, batch: NewBatch) {
    const id = batch._id ?? newId();
    await conn.insert(pantryBatches).values({ id, ingredientId, quantity: batch.quantity, unit: batch.unit, expiryDate: batch.expiryDate, source: batch.source });
    await touch(ingredientId, conn);
    return id;
  },
  async updateBatch(conn: Conn, ingredientId: string, batchId: string, fields: Partial<Omit<NewBatch, "_id">>) {
    await conn.update(pantryBatches).set(fields).where(and(eq(pantryBatches.id, batchId), eq(pantryBatches.ingredientId, ingredientId)));
    await touch(ingredientId, conn);
  },
  /** Moves a batch to another ingredient (used when a batch is renamed), updating its values. */
  async moveBatch(conn: Conn, batchId: string, fromIngredientId: string, toIngredientId: string, fields: Omit<NewBatch, "_id" | "source">) {
    await conn.update(pantryBatches).set({ ...fields, ingredientId: toIngredientId }).where(and(eq(pantryBatches.id, batchId), eq(pantryBatches.ingredientId, fromIngredientId)));
    await touch(toIngredientId, conn);
    await pantryRepo.deleteIfEmpty(conn, fromIngredientId);
  },
  async batchExists(conn: Conn, batchId: string) {
    const [row] = await conn.select({ id: pantryBatches.id }).from(pantryBatches).where(eq(pantryBatches.id, batchId)).limit(1);
    return Boolean(row);
  },
  async setCategory(conn: Conn, ingredientId: string, category: PantryCategory) {
    await conn.update(pantryIngredients).set({ category }).where(eq(pantryIngredients.id, ingredientId));
  },
  /** Removes one batch; the ingredient row is removed too once it has no batches left. */
  async removeBatch(conn: Conn, ingredientId: string, batchId: string) {
    await conn.delete(pantryBatches).where(and(eq(pantryBatches.id, batchId), eq(pantryBatches.ingredientId, ingredientId)));
    await pantryRepo.deleteIfEmpty(conn, ingredientId);
  },
  async deleteIfEmpty(conn: Conn, ingredientId: string) {
    const [left] = await conn.select({ n: count() }).from(pantryBatches).where(eq(pantryBatches.ingredientId, ingredientId));
    if (left!.n === 0) await conn.delete(pantryIngredients).where(eq(pantryIngredients.id, ingredientId));
    else await touch(ingredientId, conn);
  },
  /** Saves the batches left after cooking: updates quantities, deletes used-up batches (and the ingredient if empty). */
  async saveRemaining(conn: Conn, ingredient: Pick<IngredientStock, "_id" | "batches">) {
    for (const batch of ingredient.batches) await conn.update(pantryBatches).set({ quantity: batch.quantity }).where(eq(pantryBatches.id, batch._id));
    const keep = ingredient.batches.map((batch) => batch._id);
    await conn.delete(pantryBatches).where(keep.length
      ? and(eq(pantryBatches.ingredientId, ingredient._id), notInArray(pantryBatches.id, keep))
      : eq(pantryBatches.ingredientId, ingredient._id));
    await pantryRepo.deleteIfEmpty(conn, ingredient._id);
  },
  async setBatchQuantity(conn: Conn, ingredientId: string, batchId: string, quantity: number) {
    await conn.update(pantryBatches).set({ quantity }).where(eq(pantryBatches.id, batchId));
    await touch(ingredientId, conn);
  },
  async listForAdmin(userId: string, offset: number, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(pantryIngredients).where(eq(pantryIngredients.userId, userId))
      .orderBy(desc(pantryIngredients.createdAt), desc(pantryIngredients.id)).limit(limit).offset(offset);
    return withBatches(rows, conn);
  },
  async deleteAll(conn: Conn) { await conn.delete(pantryIngredients); },
};

// ───────────────────────────── stock operation receipts ─────────────────────────────

export interface StockOperationDoc {
  _id: string; userId: string; key: string; fingerprint: string;
  items: StockInput[]; batches: { ingredientId: string; batchId: string }[];
  createdAt: Date; updatedAt: Date;
}

async function loadOperations(rows: (typeof stockOperations.$inferSelect)[], conn: Conn): Promise<StockOperationDoc[]> {
  if (!rows.length) return [];
  const items = await conn.select().from(stockOperationItems).where(inArray(stockOperationItems.operationId, rows.map((row) => row.id))).orderBy(asc(stockOperationItems.position));
  return rows.map((row) => {
    const own = items.filter((item) => item.operationId === row.id);
    return {
      _id: row.id, userId: row.userId, key: row.key, fingerprint: row.fingerprint,
      items: own.map(({ name, quantity, unit, category, expiryDate, source }) => ({ name, quantity, unit, category, expiryDate, source })),
      batches: own.map(({ ingredientId, batchId }) => ({ ingredientId, batchId })),
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  });
}

export const stockOperationRepo = {
  async find(userId: string, key: string, conn: Conn = getDb()) {
    const rows = await conn.select().from(stockOperations).where(and(eq(stockOperations.userId, userId), eq(stockOperations.key, key)));
    return (await loadOperations(rows, conn))[0] ?? null;
  },
  async exists(userId: string, key: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ id: stockOperations.id }).from(stockOperations).where(and(eq(stockOperations.userId, userId), eq(stockOperations.key, key))).limit(1);
    return Boolean(row);
  },
  async count(userId?: string, conn: Conn = getDb()) {
    const [row] = await conn.select({ n: count() }).from(stockOperations).where(userId ? eq(stockOperations.userId, userId) : undefined);
    return row!.n;
  },
  async create(conn: Conn, data: { userId: string; key: string; fingerprint: string; items: StockInput[]; batches: { ingredientId: string; batchId: string }[] }) {
    const id = newId();
    await conn.insert(stockOperations).values({ id, userId: data.userId, key: data.key, fingerprint: data.fingerprint });
    if (data.items.length) {
      await conn.insert(stockOperationItems).values(data.items.map((item, position) => ({
        operationId: id, position, name: item.name, quantity: item.quantity, unit: item.unit, category: item.category,
        expiryDate: item.expiryDate, source: item.source, ingredientId: data.batches[position]!.ingredientId, batchId: data.batches[position]!.batchId,
      })));
    }
    return id;
  },
  async listForAdmin(userId: string, offset: number, limit: number, conn: Conn = getDb()) {
    const rows = await conn.select().from(stockOperations).where(eq(stockOperations.userId, userId))
      .orderBy(desc(stockOperations.createdAt), desc(stockOperations.id)).limit(limit).offset(offset);
    return loadOperations(rows, conn);
  },
};
