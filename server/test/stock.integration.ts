import "dotenv/config";
import jwt from "jsonwebtoken";
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { PantryIngredient } from "../src/models/PantryIngredient.js";
import { StockOperation } from "../src/models/StockOperation.js";
import { MealPlan } from "../src/models/MealPlan.js";
import { FoodHistory } from "../src/models/FoodHistory.js";
import { User } from "../src/models/User.js";
import { calendarToday, addDays } from "../src/lib/calendar.js";
import { ScheduleConflict } from "../src/lib/schedule.js";
import historyRoutes from "../src/routes/history.js";
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
before(async () => { await mongoose.connect(process.env.MONGODB_URI!, { dbName, serverSelectionTimeoutMS: 10000 }); await Promise.all([PantryIngredient.init(), StockOperation.init(), MealPlan.init(), Scan.init(), FoodHistory.init(), User.init()]); });
beforeEach(async () => { await Promise.all([PantryIngredient.deleteMany({}), StockOperation.deleteMany({}), MealPlan.deleteMany({}), Scan.deleteMany({}), FoodHistory.deleteMany({}), User.deleteMany({})]); await User.create({ _id: userId, email: "test@example.test", passwordHash: "test" }); });
after(async () => { if (mongoose.connection.db) await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); });
async function invoke(router: typeof pantryRoutes, path: string, method: string, request: Record<string, unknown>) {
  const route = router.stack.find((layer) => layer.route?.path === path && (layer.route as any).methods[method])!.route!;
  let status = 200; let data: any;
  const res = { status(code: number) { status = code; return this; }, json(value: unknown) { data = value; return this; }, end() { return this; } };
  try { await route.stack[0]!.handle({ userId, ...request } as any, res as any, () => {}); } catch (error) { if (error instanceof ScheduleConflict) { status = error.status; data = { error: error.message }; } else throw error; } return { status, data };
}
async function makePlan() {
  return MealPlan.create({ userId, title: "Test plan", status: "active", startDate: calendarToday("UTC"), days: [{ day: 1, date: calendarToday("UTC"), meals: [{ type: "breakfast", title: "Banana", description: "Banana snack", prepMinutes: 1, calories: 100,
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
  const request = { params: { id: plan.id, mealId: String(plan.days[0]!.meals[0]!._id) }, body: { timezone: "UTC", revision: plan.__v } };
  await Promise.all([invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", request), invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", request)]);
  assert.equal(await PantryIngredient.countDocuments(), 0);
  const entry = await FoodHistory.findOne({ userId, reversed: false });
  const undo = { params: { id: String(entry!._id) } };
  await Promise.all([invoke(historyRoutes, "/:id/undo", "post", undo), invoke(historyRoutes, "/:id/undo", "post", undo)]);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
});
const mealRecipe = (type: string, title: string, quantity = 1) => ({ type, title, description: title, prepMinutes: 1, calories: 100,
  nutrition: { proteinGrams: 1, carbsGrams: 25, fatGrams: 0 }, ingredients: [{ name: "banana", quantity, unit: "pcs", fromPantry: true }], steps: ["Eat banana"] });
async function makeDraft(types = ["breakfast", "lunch", "dinner"]) {
  return new MealPlan({ userId, title: "Replacement", days: [1, 2].map((day) => ({ day, meals: types.map((type) => mealRecipe(type, `New ${type}`)) })),
    settingsSnapshot: { diet: "none", allergies: [], goal: "balanced", budget: "low", mealTypes: types, maxExtraItems: null } });
}
function previewToken(plan: InstanceType<typeof MealPlan>) {
  plan.__v = 0;
  return jwt.sign({ plan: plan.toObject() }, `${process.env.JWT_SECRET!}:meal-plan-preview`, { subject: userId, audience: "meal-plan-preview", expiresIn: "1h" });
}
async function mark(plan: Awaited<ReturnType<typeof makePlan>>, mealId = String(plan.days[0]!.meals[0]!._id), confirm = false) {
  const current = await MealPlan.findById(plan.id);
  return invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", { params: { id: plan.id, mealId }, body: { timezone: "UTC", confirm, revision: current?.__v ?? plan.__v } });
}
const target = (plan: { id: string; __v: number } | null) => ({ timezone: "UTC", activeId: plan?.id ?? null, revision: plan?.__v ?? null });
test("future marks fail without stock changes, while late logging retains its planned date", async () => {
  const plan = await makePlan(); await addStock(userId, "future:stock", [item]);
  plan.days[0]!.date = addDays(calendarToday("UTC"), 1); await plan.save();
  assert.equal((await mark(plan)).status, 409); assert.equal(await FoodHistory.countDocuments(), 0);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
  plan.days[0]!.date = addDays(calendarToday("UTC"), -1); await plan.save();
  assert.equal((await mark(plan)).status, 200);
  const entry = await FoodHistory.findOne({ userId }); assert.equal(entry!.date, plan.days[0]!.date);
  assert.equal(entry!.recordedAt.toISOString().slice(0, 10), calendarToday("UTC"));
  assert.equal(await PantryIngredient.countDocuments(), 0);
});
test("replacement preserves history and carries today's eaten slots, including omitted meal types", async () => {
  const plan = await makePlan(); await addStock(userId, "carry:stock", [item]); await mark(plan);
  const entry = await FoodHistory.findOne({ userId });
  const current = (await MealPlan.findById(plan.id))!;
  assert.equal(await FoodHistory.countDocuments({ reversed: false }), 1); assert.equal(await PantryIngredient.countDocuments(), 0);
  const draft = await makeDraft(["lunch", "dinner"]);
  const response = await invoke(planRoutes, "/replace", "post", { params: { id: draft.id }, body: { ...target(current), previewToken: previewToken(draft) } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.days[0].meals.map((m: any) => m.type), ["breakfast", "lunch", "dinner"]);
  assert.equal(String(response.data.days[0].meals[0]._id), String(entry!.mealId));
  assert.equal(response.data.days[0].meals[0].eaten, true);
  await invoke(historyRoutes, "/:id/undo", "post", { params: { id: String(entry!._id) } });
  assert.equal((await MealPlan.findById(draft.id))!.days[0]!.meals[0]!.eaten, false);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
});
test("whole-plan replacement keeps eaten slots once, future days get fresh identities, and repeated activation is harmless", async () => {
  const plan = await makePlan(); await addStock(userId, "whole:stock", [item]); await mark(plan);
  const current = (await MealPlan.findById(plan.id))!;
  const draft = await makeDraft(); const originalIds = draft.days[1]!.meals.map((meal) => String(meal._id));
  const request = { params: { id: draft.id }, body: { ...target(current), previewToken: previewToken(draft) } };
  const response = await invoke(planRoutes, "/replace", "post", request);
  assert.equal(response.status, 200); assert.equal(response.data.days[0].meals.filter((meal: any) => meal.type === "breakfast").length, 1);
  assert.equal(response.data.days[0].meals[0].title, "Banana");
  assert.equal(response.data.days[1].date, addDays(calendarToday("UTC"), 1));
  assert.equal(response.data.days[1].meals.some((meal: any) => originalIds.includes(String(meal._id))), false);
  assert.equal((await invoke(planRoutes, "/replace", "post", request)).status, 200);
  assert.equal(await MealPlan.countDocuments({ status: "active" }), 1); assert.equal(await FoodHistory.countDocuments({ reversed: false }), 1);
});

test("shortage confirmation records only actual deductions; old undo cannot reverse a later re-log", async () => {
  const plan = await makePlan(); await addStock(userId, "short:stock", [{ ...item, quantity: 1 }]);
  assert.equal((await mark(plan)).status, 409); assert.equal(await FoodHistory.countDocuments(), 0);
  assert.equal((await mark(plan, undefined, true)).status, 200);
  const first = (await FoodHistory.findOne({ userId }).select("+consumed"))!;
  assert.equal(first.consumed[0]!.amount, 1); assert.equal(first.meal!.calories, 100);
  const request = { params: { id: String(first._id) } }; await invoke(historyRoutes, "/:id/undo", "post", request);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 1);
  await mark(plan, undefined, true); await invoke(historyRoutes, "/:id/undo", "post", request);
  assert.equal(await PantryIngredient.countDocuments(), 0); assert.equal(await FoodHistory.countDocuments({ reversed: false }), 1);
});
test("history pagination has complete daily totals, hides deductions, validates cursors, and isolates users", async () => {
  const plan = await makePlan(); plan.days[0]!.meals.push(mealRecipe("lunch", "Lunch")); await plan.save();
  await addStock(userId, "page:stock", [{ ...item, quantity: 5 }]);
  await mark(plan); await mark(plan, String(plan.days[0]!.meals[1]!._id));
  const first = (await invoke(historyRoutes, "/", "get", { query: { limit: "1" } })).data;
  assert.equal(first.entries.length, 1); assert.equal(first.totals[calendarToday("UTC")].meals, 2); assert.equal(first.totals[calendarToday("UTC")].calories, 200);
  assert.equal("consumed" in first.entries[0], false); assert.ok(first.nextCursor);
  const second = (await invoke(historyRoutes, "/", "get", { query: { limit: "1", cursor: first.nextCursor } })).data;
  assert.notEqual(String(first.entries[0]._id), String(second.entries[0]._id)); assert.equal(second.nextCursor, null);
  assert.equal((await invoke(historyRoutes, "/", "get", { query: { cursor: "invalid" } })).status, 400);
  const otherUser = String(new Types.ObjectId());
  assert.equal((await invoke(historyRoutes, "/", "get", { userId: otherUser, query: {} })).data.entries.length, 0);
  await User.create({ _id: otherUser, email: "other@example.test", passwordHash: "test" });
  assert.equal((await invoke(historyRoutes, "/:id/undo", "post", { userId: otherUser, params: { id: String(first.entries[0]._id) } })).status, 404);
});
test("concurrent replacement and mark either preserve the eaten recipe or reject its stale ID", async () => {
  const plan = await makePlan(); const draft = await makeDraft(); await addStock(userId, "race:stock", [item]);
  const [eaten, replaced] = await Promise.all([
    mark(plan), invoke(planRoutes, "/replace", "post", { params: { id: draft.id }, body: { ...target(plan), previewToken: previewToken(draft) } }),
  ]);
  const saved = (await MealPlan.findOne({ userId, status: "active" }))!;
  if (eaten.status === 200) {
    assert.equal(saved.days[0]!.meals[0]!.title, "Banana"); assert.equal(saved.days[0]!.meals[0]!.eaten, true);
    assert.equal(replaced.status, 409);
  } else {
    assert.equal(eaten.status, 404); assert.equal(replaced.status, 200); assert.equal(await FoodHistory.countDocuments(), 0);
    assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
  }
});
test("concurrent activation yields one active plan and a refreshable conflict", async () => {
  const a = await makeDraft(); const b = await makeDraft();
  const outcomes = await Promise.all([a, b].map((draft) => invoke(planRoutes, "/replace", "post", { body: { ...target(null), previewToken: previewToken(draft) } })));
  assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409]); assert.equal(await MealPlan.countDocuments({ status: "active" }), 1);
});

test("undo past history after replacement restores stock once without restoring the old plan", async () => {
  const plan = await makePlan();
  plan.days[0]!.date = addDays(calendarToday("UTC"), -1); await plan.save();
  await addStock(userId, "removed:stock", [item]); await mark(plan);
  const entry = (await FoodHistory.findOne({ userId }))!;
  const current = (await MealPlan.findById(plan.id))!;
  const draft = await makeDraft();
  assert.equal((await invoke(planRoutes, "/replace", "post", { body: { ...target(current), previewToken: previewToken(draft) } })).status, 200);
  const request = { params: { id: String(entry._id) } };
  await Promise.all([invoke(historyRoutes, "/:id/undo", "post", request), invoke(historyRoutes, "/:id/undo", "post", request)]);
  assert.equal(await MealPlan.findById(plan.id), null); assert.equal(await MealPlan.countDocuments(), 1);
  assert.equal(await FoodHistory.countDocuments({ reversed: false }), 0);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
});
test("development mock reset removes domain data and preserves account preferences; production reset is refused", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const uri = new URL(process.env.MONGODB_URI!); uri.pathname = `/${dbName}`;
  const account = await User.findById(userId).lean();
  const plan = await makePlan(); await addStock(userId, "reset:stock", [item]); await mark(plan);
  const env = { ...process.env, MONGODB_URI: uri.toString() };
  await assert.rejects(run(process.execPath, ["--import", "tsx", "src/scripts/reset-mock.ts", "--confirm"], { env: { ...env, NODE_ENV: "production" } }));
  assert.equal(await MealPlan.countDocuments(), 1);
  await assert.rejects(run(process.execPath, ["--import", "tsx", "src/scripts/reset-mock.ts"], { env: { ...env, NODE_ENV: "development" } }));
  assert.equal(await FoodHistory.countDocuments(), 1);
  await run(process.execPath, ["--import", "tsx", "src/scripts/reset-mock.ts", "--confirm"], { env: { ...env, NODE_ENV: "development" } });
  for (const model of [MealPlan, FoodHistory, PantryIngredient, StockOperation, Scan]) assert.equal(await model.collection.countDocuments(), 0);
  const preserved = await User.findById(userId).lean();
  assert.equal(preserved!.email, account!.email); assert.deepEqual(preserved!.preferences, account!.preferences);
});
test("whole-plan replacement refuses a schedule containing only the same protected eaten meals", async () => {
  const plan = await makePlan(); await addStock(userId, "whole-noop:stock", [item]); await mark(plan);
  const current = (await MealPlan.findById(plan.id))!;
  const draft = await makeDraft(["breakfast"]); draft.days.splice(1);
  const response = await invoke(planRoutes, "/replace", "post", { params: { id: draft.id }, body: { ...target(current), previewToken: previewToken(draft) } });
  assert.equal(response.status, 409); assert.equal((await MealPlan.findById(plan.id))!.status, "active");
  assert.equal(await MealPlan.findById(draft.id), null); assert.equal(await FoodHistory.countDocuments({ reversed: false }), 1);
});
test("a delayed mark retry after undo cannot log the meal again", async () => {
  const plan = await makePlan(); await addStock(userId, "delayed:stock", [item]);
  const request = { params: { id: plan.id, mealId: String(plan.days[0]!.meals[0]!._id) }, body: { timezone: "UTC", revision: plan.__v } };
  assert.equal((await invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", request)).status, 200);
  const entry = (await FoodHistory.findOne({ userId }))!;
  await invoke(historyRoutes, "/:id/undo", "post", { params: { id: String(entry._id) } });
  assert.equal((await invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", request)).status, 409);
  assert.equal(await FoodHistory.countDocuments({ reversed: false }), 0);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
  assert.equal((await mark(plan)).status, 200);
});

test("previews are not stored, cannot be tampered with, and are bound to their user", async () => {
  const preview = await makeDraft();
  assert.equal(await MealPlan.countDocuments(), 0);
  const token = previewToken(preview);
  assert.equal((await invoke(planRoutes, "/replace", "post", { body: { ...target(null), previewToken: token + "x" } })).status, 400);
  assert.equal((await invoke(planRoutes, "/replace", "post", { userId: String(new Types.ObjectId()), body: { ...target(null), previewToken: token } })).status, 400);
  const expired = jwt.sign({ plan: preview.toObject() }, `${process.env.JWT_SECRET!}:meal-plan-preview`, { subject: userId, audience: "meal-plan-preview", expiresIn: -1 });
  assert.equal((await invoke(planRoutes, "/replace", "post", { body: { ...target(null), previewToken: expired } })).status, 400);
  assert.equal(await MealPlan.countDocuments(), 0);
  assert.equal((await invoke(planRoutes, "/replace", "post", { body: { ...target(null), previewToken: token } })).status, 200);
  assert.equal(await MealPlan.countDocuments(), 1);
});
