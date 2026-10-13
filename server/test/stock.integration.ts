import "dotenv/config";
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { PantryIngredient } from "../src/models/PantryIngredient.js";
import { StockOperation } from "../src/models/StockOperation.js";
import { MealPlan } from "../src/models/MealPlan.js";
import { Scan } from "../src/models/Scan.js";
import { addStock, addStockInSession } from "../src/lib/add-stock.js";
import { readPantry, presentIngredient } from "../src/lib/pantry.js";
import { consumeIngredients, restoreIngredients } from "../src/lib/consume.js";
import { stockScan } from "../src/lib/stock-scan.js";
import { stockShoppingItem } from "../src/lib/stock-shopping.js";
import pantryRoutes from "../src/routes/pantry.js";
import planRoutes from "../src/routes/plans.js";
const userId = String(new Types.ObjectId());
const dbName = `mealmind_stock_test_${Date.now()}`;
const item = { name: "banana", quantity: 3, unit: "pcs", category: "produce" as const, expiryDate: null, source: "manual" as const };
before(async () => { await mongoose.connect(process.env.MONGODB_URI!, { dbName, serverSelectionTimeoutMS: 10000 }); await Promise.all([PantryIngredient.init(), StockOperation.init(), MealPlan.init(), Scan.init()]); });
beforeEach(async () => { await Promise.all([PantryIngredient.deleteMany({}), StockOperation.deleteMany({}), MealPlan.deleteMany({}), Scan.deleteMany({})]); });
after(async () => { await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect(); });
async function invoke(router: typeof pantryRoutes, path: string, method: string, request: Record<string, unknown>) {
  const route = router.stack.find((layer) => layer.route?.path === path && (layer.route as any).methods[method])!.route!;
  let status = 200; let data: any;
  const res = { status(code: number) { status = code; return this; }, json(value: unknown) { data = value; return this; }, end() { return this; } };
  await route.stack[0]!.handle({ userId, ...request } as any, res as any, () => {}); return { status, data };
}
async function makePlan() {
  return MealPlan.create({ userId, title: "Test plan", status: "active", days: [{ day: 1, meals: [{ type: "breakfast", title: "Banana", description: "Banana snack", prepMinutes: 1, calories: 100,
    nutrition: { proteinGrams: 1, carbsGrams: 25, fatGrams: 0 }, ingredients: [{ name: "banana", quantity: 3, unit: "pcs", fromPantry: true }], steps: ["Eat banana"] }] }],
    settingsSnapshot: { diet: "none", allergies: [], goal: "balanced", budget: "low", mealTypes: ["breakfast"], maxExtraItems: null } });
}
test("database enforces uniqueness while concurrent additions increase stock", async () => {
  await Promise.all([addStock(userId, "manual:a", [item]), addStock(userId, "manual:b", [{ ...item, name: "BANANAS", quantity: 4 }])]);
  const pantry = await readPantry(userId);
  assert.equal(pantry.length, 1); assert.equal(pantry[0]!.batches.length, 2); assert.equal(presentIngredient(pantry[0]!).totals[0]!.quantity, 7);
  await assert.rejects(PantryIngredient.create({ ...pantry[0], _id: new Types.ObjectId() }), (error: any) => error.code === 11000);
});
test("receipts prevent retry additions even after stock records are physically deleted", async () => {
  await Promise.all([addStock(userId, "manual:once", [item]), addStock(userId, "manual:once", [item])]);
  assert.equal(await StockOperation.countDocuments(), 1);
  await mongoose.connection.transaction((session) => consumeIngredients(userId, [{ name: "banana", quantity: 3, unit: "pcs" }], session));
  assert.equal(await PantryIngredient.countDocuments(), 0); await addStock(userId, "manual:once", [item]);
  assert.equal(await PantryIngredient.countDocuments(), 0);
  await assert.rejects(addStock(userId, "manual:once", [{ ...item, quantity: 9 }]), /different purchase/);
});
test("failed transactions leave neither partial stock nor an operation receipt", async () => {
  await assert.rejects(mongoose.connection.transaction(async (session) => { await addStockInSession(userId, "manual:abort", [item], session); throw new Error("abort"); }), /abort/);
  assert.equal(await PantryIngredient.countDocuments(), 0); assert.equal(await StockOperation.countDocuments(), 0);
  await addStock(userId, "manual:abort", [item]); assert.equal(await PantryIngredient.countDocuments(), 1);
});
test("concurrent scan confirms stock once and cannot resurrect exhausted stock", async () => {
  const scan = await Scan.create({ userId, type: "receipt" }); const { source, ...reviewed } = item;
  await Promise.all([stockScan(userId, scan.id, [reviewed]), stockScan(userId, scan.id, [reviewed])]);
  assert.equal((await Scan.findById(scan.id))!.status, "confirmed"); assert.equal(await StockOperation.countDocuments(), 1);
  await mongoose.connection.transaction((session) => consumeIngredients(userId, [{ name: "banana", quantity: 3, unit: "pcs" }], session));
  await stockScan(userId, scan.id, [reviewed]); assert.equal(await PantryIngredient.countDocuments(), 0);
});
test("undo restores exhausted batches and their expiry history without zero records", async () => {
  await addStock(userId, "manual:early", [{ ...item, quantity: 2, expiryDate: new Date("2026-10-14") }]); await addStock(userId, "manual:late", [{ ...item, expiryDate: new Date("2026-10-17") }]);
  const deductions = await mongoose.connection.transaction((session) => consumeIngredients(userId, [{ name: "banana", quantity: 4, unit: "pcs" }], session));
  assert.equal((await readPantry(userId))[0]!.batches.length, 1);
  await mongoose.connection.transaction((session) => restoreIngredients(userId, deductions, session));
  const pantry = presentIngredient((await readPantry(userId))[0]!); assert.deepEqual(pantry.batches.map((batch) => batch.quantity), [2, 3]);
});
test("batch corrections move stock into the existing ingredient and deletion removes the batch", async () => {
  await addStock(userId, "manual:banana", [item]); await addStock(userId, "manual:apple", [{ ...item, name: "apple", quantity: 2 }]);
  const banana = (await readPantry(userId)).find((ingredient) => ingredient.key === "banana")!; const params = { ingredientId: String(banana._id), batchId: String(banana.batches[0]!._id) };
  assert.equal((await invoke(pantryRoutes, "/:ingredientId/batches/:batchId", "patch", { params, body: { ...item, name: "apples", quantity: 4 } })).status, 200);
  const pantry = await readPantry(userId); assert.equal(pantry.length, 1); assert.equal(presentIngredient(pantry[0]!).totals[0]!.quantity, 6);
  assert.equal((await invoke(pantryRoutes, "/:ingredientId/batches/:batchId", "delete", { params: { ingredientId: String(pantry[0]!._id), batchId: params.batchId } })).status, 204);
  assert.equal((await readPantry(userId))[0]!.batches.length, 1);
});
test("shopping reads are pure, purchase retries count once, and a later shortage permits a new purchase", async () => {
  const plan = await makePlan(); const before = await MealPlan.findById(plan._id).lean();
  const request = { params: { id: plan.id } }; const response = await invoke(planRoutes, "/:id", "get", request);
  assert.deepEqual(await MealPlan.findById(plan._id).lean(), before); const row = response.data.shoppingList[0];
  await stockShoppingItem(userId, plan.id, row._id); await stockShoppingItem(userId, plan.id, row._id); assert.equal(await StockOperation.countDocuments(), 1);
  await mongoose.connection.transaction((session) => consumeIngredients(userId, [{ name: "banana", quantity: 3, unit: "pcs" }], session));
  await stockShoppingItem(userId, plan.id, row._id); assert.equal(await PantryIngredient.countDocuments(), 0);
  const next = (await invoke(planRoutes, "/:id", "get", request)).data.shoppingList[0]; assert.notEqual(next._id, row._id);
  await stockShoppingItem(userId, plan.id, next._id); assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
});
test("concurrent cooking cannot double consume and concurrent undo restores stock once", async () => {
  const plan = await makePlan(); await addStock(userId, "manual:cooking", [item]);
  const request = { params: { id: plan.id }, body: { day: 1, index: 0, made: true } };
  await Promise.all([invoke(planRoutes, "/:id/meals/made", "post", request), invoke(planRoutes, "/:id/meals/made", "post", request)]);
  assert.equal(await PantryIngredient.countDocuments(), 0);
  const undo = { ...request, body: { day: 1, index: 0, made: false } };
  await Promise.all([invoke(planRoutes, "/:id/meals/made", "post", undo), invoke(planRoutes, "/:id/meals/made", "post", undo)]);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
});
