import "dotenv/config";
import jwt from "jsonwebtoken";
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/mysql.js";
import { getDb } from "../src/db/client.js";
import { newId } from "../src/db/ids.js";
import { isDuplicateKey, transaction } from "../src/db/tx.js";
import * as schema from "../src/db/schema.js";
import { userRepo } from "../src/repos/users.js";
import { pantryRepo, stockOperationRepo } from "../src/repos/pantry.js";
import { buildPlan, mealPlanRepo, type PlanDoc } from "../src/repos/meal-plans.js";
import { foodHistoryRepo } from "../src/repos/food-history.js";
import { plannedDayRepo } from "../src/repos/planned-days.js";
import { scanRepo } from "../src/repos/scans.js";
import { calendarToday, addDays } from "../src/lib/calendar.js";
import { ScheduleConflict } from "../src/lib/schedule.js";
import historyRoutes from "../src/routes/history.js";
import { addStock, addStockInSession } from "../src/lib/add-stock.js";
import { readPantry, presentIngredient } from "../src/lib/pantry.js";
import { consumeIngredients, restoreIngredients } from "../src/lib/consume.js";
import { stockScan } from "../src/lib/stock-scan.js";
import { stockShoppingItem } from "../src/lib/stock-shopping.js";
import pantryRoutes from "../src/routes/pantry.js";
import planRoutes from "../src/routes/plans.js";

const userId = newId();
const item = { name: "banana", quantity: 3, unit: "pcs", category: "produce" as const, expiryDate: null, source: "manual" as const };
let database: Awaited<ReturnType<typeof createTestDatabase>>;
before(async () => { database = await createTestDatabase("mealmind_stock_test"); });
beforeEach(async () => {
  const db = getDb();
  for (const table of [schema.mealPlans, schema.foodHistory, schema.pantryIngredients, schema.stockOperations, schema.scans, schema.users]) await db.delete(table);
  await userRepo.create({ id: userId, email: "test@example.test", passwordHash: "test" });
});
after(async () => { await database.drop(); });

async function invoke(router: typeof pantryRoutes, path: string, method: string, request: Record<string, unknown>) {
  const route = router.stack.find((layer) => layer.route?.path === path && (layer.route as any).methods[method])!.route!;
  let status = 200; let data: any;
  const res = { status(code: number) { status = code; return this; }, json(value: unknown) { data = JSON.parse(JSON.stringify(value)); return this; }, end() { return this; } };
  try { await route.stack[0]!.handle({ userId, ...request } as any, res as any, () => {}); } catch (error) { if (error instanceof ScheduleConflict) { status = error.status; data = { error: error.message }; } else throw error; } return { status, data };
}
const mealRecipe = (type: string, title: string, quantity = 1) => ({ type: type as "breakfast", title, description: title, prepMinutes: 1, calories: 100,
  nutrition: { proteinGrams: 1, carbsGrams: 25, fatGrams: 0 }, ingredients: [{ name: "banana", quantity, unit: "pcs", fromPantry: true }], steps: ["Eat banana"] });
async function makePlan() {
  return transaction((tx) => mealPlanRepo.insert(tx, buildPlan({ userId, title: "Test plan", startDate: calendarToday("UTC"), days: [{ day: 1, date: calendarToday("UTC"), meals: [{ ...mealRecipe("breakfast", "Banana", 3), description: "Banana snack" }] }],
    settingsSnapshot: { diet: "none", allergies: [], goal: "balanced", budget: "low", mealTypes: ["breakfast"], maxExtraItems: null } })));
}
const findPlan = (id: string) => mealPlanRepo.findById(id);
const savePlan = (plan: PlanDoc) => transaction((tx) => mealPlanRepo.save(tx, plan));
function makeDraft(types = ["breakfast", "lunch", "dinner"]) {
  return buildPlan({ userId, title: "Replacement", days: [1, 2].map((day) => ({ day, meals: types.map((type) => mealRecipe(type, `New ${type}`)) })),
    settingsSnapshot: { diet: "none", allergies: [], goal: "balanced", budget: "low", mealTypes: types, maxExtraItems: null } });
}
function previewToken(plan: PlanDoc) {
  plan.__v = 0;
  return jwt.sign({ plan }, `${process.env.JWT_SECRET!}:meal-plan-preview`, { subject: userId, audience: "meal-plan-preview", expiresIn: "1h" });
}
async function mark(plan: PlanDoc, mealId = String(plan.days[0]!.meals[0]!._id), confirm = false) {
  const current = await findPlan(plan._id);
  return invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", { params: { id: plan._id, mealId }, body: { timezone: "UTC", confirm, revision: current?.__v ?? plan.__v } });
}
const target = (plan: { _id: string; __v: number } | null) => ({ timezone: "UTC", activeId: plan?._id ?? null, revision: plan?.__v ?? null });
const liveHistory = () => foodHistoryRepo.count({ reversed: false });

test("database enforces uniqueness while concurrent additions increase stock", async () => {
  await Promise.all([addStock(userId, "manual:a", [item]), addStock(userId, "manual:b", [{ ...item, name: "BANANAS", quantity: 4 }])]);
  const pantry = await readPantry(userId);
  assert.equal(pantry.length, 1); assert.equal(pantry[0]!.batches.length, 2); assert.equal(presentIngredient(pantry[0]!).totals[0]!.quantity, 7);
  await assert.rejects(transaction((tx) => pantryRepo.create(tx, { ...pantry[0]!, batches: [] })), (error) => isDuplicateKey(error));
});
test("receipts prevent retry additions even after stock records are physically deleted", async () => {
  await Promise.all([addStock(userId, "manual:once", [item]), addStock(userId, "manual:once", [item])]);
  assert.equal(await stockOperationRepo.count(), 1);
  await transaction((tx) => consumeIngredients(userId, [{ name: "banana", quantity: 3, unit: "pcs" }], tx));
  assert.equal(await pantryRepo.count(), 0); await addStock(userId, "manual:once", [item]);
  assert.equal(await pantryRepo.count(), 0);
  await assert.rejects(addStock(userId, "manual:once", [{ ...item, quantity: 9 }]), /different purchase/);
});
test("failed transactions leave neither partial stock nor an operation receipt", async () => {
  await assert.rejects(transaction(async (tx) => { await addStockInSession(userId, "manual:abort", [item], tx); throw new Error("abort"); }), /abort/);
  assert.equal(await pantryRepo.count(), 0); assert.equal(await stockOperationRepo.count(), 0);
  await addStock(userId, "manual:abort", [item]); assert.equal(await pantryRepo.count(), 1);
});
test("concurrent scan confirms stock once and cannot resurrect exhausted stock", async () => {
  const scanId = await scanRepo.create({ userId, type: "receipt" }); const { source, ...reviewed } = item;
  await Promise.all([stockScan(userId, scanId, [reviewed]), stockScan(userId, scanId, [reviewed])]);
  assert.equal((await scanRepo.findById(scanId))!.status, "confirmed"); assert.equal(await stockOperationRepo.count(), 1);
  await transaction((tx) => consumeIngredients(userId, [{ name: "banana", quantity: 3, unit: "pcs" }], tx));
  await stockScan(userId, scanId, [reviewed]); assert.equal(await pantryRepo.count(), 0);
});
test("undo restores exhausted batches and their expiry history without zero records", async () => {
  await addStock(userId, "manual:early", [{ ...item, quantity: 2, expiryDate: new Date("2026-10-14") }]); await addStock(userId, "manual:late", [{ ...item, expiryDate: new Date("2026-10-17") }]);
  const deductions = await transaction((tx) => consumeIngredients(userId, [{ name: "banana", quantity: 4, unit: "pcs" }], tx));
  assert.equal((await readPantry(userId))[0]!.batches.length, 1);
  await transaction((tx) => restoreIngredients(userId, deductions, tx));
  const pantry = presentIngredient((await readPantry(userId))[0]!); assert.deepEqual(pantry.batches.map((batch) => batch.quantity), [2, 3]);
  assert.equal(pantry.batches[0]!.expiryDate!.toISOString(), "2026-10-14T00:00:00.000Z");
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
  const plan = await makePlan(); const beforeRead = await findPlan(plan._id);
  const request = { params: { id: plan._id } }; const response = await invoke(planRoutes, "/:id", "get", request);
  assert.deepEqual(await findPlan(plan._id), beforeRead); const row = response.data.shoppingList[0];
  await stockShoppingItem(userId, plan._id, row._id); await stockShoppingItem(userId, plan._id, row._id); assert.equal(await stockOperationRepo.count(), 1);
  await transaction((tx) => consumeIngredients(userId, [{ name: "banana", quantity: 3, unit: "pcs" }], tx));
  await stockShoppingItem(userId, plan._id, row._id); assert.equal(await pantryRepo.count(), 0);
  const next = (await invoke(planRoutes, "/:id", "get", request)).data.shoppingList[0]; assert.notEqual(next._id, row._id);
  await stockShoppingItem(userId, plan._id, next._id); assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
});
test("concurrent cooking cannot double consume and concurrent undo restores stock once", async () => {
  const plan = await makePlan(); await addStock(userId, "manual:cooking", [item]);
  const request = { params: { id: plan._id, mealId: String(plan.days[0]!.meals[0]!._id) }, body: { timezone: "UTC", revision: plan.__v } };
  await Promise.all([invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", request), invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", request)]);
  assert.equal(await pantryRepo.count(), 0);
  const entry = await foodHistoryRepo.findOne({ userId, reversed: false });
  const undo = { params: { id: String(entry!._id) } };
  await Promise.all([invoke(historyRoutes, "/:id/undo", "post", undo), invoke(historyRoutes, "/:id/undo", "post", undo)]);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
});
test("future marks fail without stock changes, while late logging retains its planned date", async () => {
  const plan = await makePlan(); await addStock(userId, "future:stock", [item]);
  plan.days[0]!.date = addDays(calendarToday("UTC"), 1); await savePlan(plan);
  assert.equal((await mark(plan)).status, 409); assert.equal(await foodHistoryRepo.count(), 0);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
  plan.days[0]!.date = addDays(calendarToday("UTC"), -1); await savePlan(plan);
  assert.equal((await mark(plan)).status, 200);
  const entry = await foodHistoryRepo.findOne({ userId }); assert.equal(entry!.date, plan.days[0]!.date);
  assert.equal(entry!.recordedAt.toISOString().slice(0, 10), calendarToday("UTC"));
  assert.equal(await pantryRepo.count(), 0);
});
test("replacement preserves history and carries today's eaten slots, including omitted meal types", async () => {
  const plan = await makePlan(); await addStock(userId, "carry:stock", [item]); await mark(plan);
  const entry = await foodHistoryRepo.findOne({ userId });
  const current = (await findPlan(plan._id))!;
  assert.equal(await liveHistory(), 1); assert.equal(await pantryRepo.count(), 0);
  const draft = makeDraft(["lunch", "dinner"]);
  const response = await invoke(planRoutes, "/replace", "post", { body: { ...target(current), previewToken: previewToken(draft) } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.days[0].meals.map((m: any) => m.type), ["breakfast", "lunch", "dinner"]);
  assert.equal(String(response.data.days[0].meals[0]._id), String(entry!.mealId));
  assert.equal(response.data.days[0].meals[0].eaten, true);
  await invoke(historyRoutes, "/:id/undo", "post", { params: { id: String(entry!._id) } });
  assert.equal((await findPlan(draft._id))!.days[0]!.meals[0]!.eaten, false);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
});
test("whole-plan replacement keeps eaten slots once, future days get fresh identities, and repeated activation is harmless", async () => {
  const plan = await makePlan(); await addStock(userId, "whole:stock", [item]); await mark(plan);
  const current = (await findPlan(plan._id))!;
  const draft = makeDraft(); const originalIds = draft.days[1]!.meals.map((meal) => String(meal._id));
  const request = { body: { ...target(current), previewToken: previewToken(draft) } };
  const response = await invoke(planRoutes, "/replace", "post", request);
  assert.equal(response.status, 200); assert.equal(response.data.days[0].meals.filter((meal: any) => meal.type === "breakfast").length, 1);
  assert.equal(response.data.days[0].meals[0].title, "Banana");
  assert.equal(response.data.days[1].date, addDays(calendarToday("UTC"), 1));
  assert.equal(response.data.days[1].meals.some((meal: any) => originalIds.includes(String(meal._id))), false);
  assert.equal((await invoke(planRoutes, "/replace", "post", request)).status, 200);
  assert.equal(await mealPlanRepo.count({ status: "active" }), 1); assert.equal(await liveHistory(), 1);
});
test("shortage confirmation records only actual deductions; old undo cannot reverse a later re-log", async () => {
  const plan = await makePlan(); await addStock(userId, "short:stock", [{ ...item, quantity: 1 }]);
  assert.equal((await mark(plan)).status, 409); assert.equal(await foodHistoryRepo.count(), 0);
  assert.equal((await mark(plan, undefined, true)).status, 200);
  const first = (await foodHistoryRepo.findOne({ userId }, undefined, { withConsumed: true }))!;
  assert.equal(first.consumed![0]!.amount, 1); assert.equal(first.meal.calories, 100);
  const request = { params: { id: String(first._id) } }; await invoke(historyRoutes, "/:id/undo", "post", request);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 1);
  await mark(plan, undefined, true); await invoke(historyRoutes, "/:id/undo", "post", request);
  assert.equal(await pantryRepo.count(), 0); assert.equal(await liveHistory(), 1);
});
test("history pagination has complete daily totals, hides deductions, validates cursors, and isolates users", async () => {
  const plan = await makePlan(); plan.days[0]!.meals.push({ ...buildPlan({ userId, title: "x", days: [{ day: 1, meals: [mealRecipe("lunch", "Lunch")] }], settingsSnapshot: plan.settingsSnapshot }).days[0]!.meals[0]! });
  const saved = await savePlan(plan);
  await addStock(userId, "page:stock", [{ ...item, quantity: 5 }]);
  await mark(saved); await mark(saved, String(saved.days[0]!.meals[1]!._id));
  const first = (await invoke(historyRoutes, "/", "get", { query: { limit: "1" } })).data;
  assert.equal(first.entries.length, 1); assert.equal(first.totals[calendarToday("UTC")].meals, 2); assert.equal(first.totals[calendarToday("UTC")].calories, 200);
  assert.equal("consumed" in first.entries[0], false); assert.ok(first.nextCursor);
  const second = (await invoke(historyRoutes, "/", "get", { query: { limit: "1", cursor: first.nextCursor } })).data;
  assert.notEqual(String(first.entries[0]._id), String(second.entries[0]._id)); assert.equal(second.nextCursor, null);
  assert.equal((await invoke(historyRoutes, "/", "get", { query: { cursor: "invalid" } })).status, 400);
  const otherUser = newId();
  assert.equal((await invoke(historyRoutes, "/", "get", { userId: otherUser, query: {} })).data.entries.length, 0);
  await userRepo.create({ id: otherUser, email: "other@example.test", passwordHash: "test" });
  assert.equal((await invoke(historyRoutes, "/:id/undo", "post", { userId: otherUser, params: { id: String(first.entries[0]._id) } })).status, 404);
});
test("concurrent replacement and mark either preserve the eaten recipe or reject its stale ID", async () => {
  const plan = await makePlan(); const draft = makeDraft(); await addStock(userId, "race:stock", [item]);
  const [eaten, replaced] = await Promise.all([
    mark(plan), invoke(planRoutes, "/replace", "post", { body: { ...target(plan), previewToken: previewToken(draft) } }),
  ]);
  const saved = (await mealPlanRepo.findActive(userId))!;
  if (eaten.status === 200) {
    assert.equal(saved.days[0]!.meals[0]!.title, "Banana"); assert.equal(saved.days[0]!.meals[0]!.eaten, true);
    assert.equal(replaced.status, 409);
  } else {
    assert.equal(eaten.status, 404); assert.equal(replaced.status, 200); assert.equal(await foodHistoryRepo.count(), 0);
    assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
  }
});
test("concurrent activation yields one active plan and a refreshable conflict", async () => {
  const a = makeDraft(); const b = makeDraft();
  const outcomes = await Promise.all([a, b].map((draft) => invoke(planRoutes, "/replace", "post", { body: { ...target(null), previewToken: previewToken(draft) } })));
  assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409]); assert.equal(await mealPlanRepo.count({ status: "active" }), 1);
});
test("undo past history after replacement restores stock once without restoring the old plan", async () => {
  const plan = await makePlan();
  plan.days[0]!.date = addDays(calendarToday("UTC"), -1); await savePlan(plan);
  await addStock(userId, "removed:stock", [item]); await mark(plan);
  const entry = (await foodHistoryRepo.findOne({ userId }))!;
  const current = (await findPlan(plan._id))!;
  const draft = makeDraft();
  assert.equal((await invoke(planRoutes, "/replace", "post", { body: { ...target(current), previewToken: previewToken(draft) } })).status, 200);
  const request = { params: { id: String(entry._id) } };
  await Promise.all([invoke(historyRoutes, "/:id/undo", "post", request), invoke(historyRoutes, "/:id/undo", "post", request)]);
   assert.equal(await findPlan(plan._id), null); assert.equal(await mealPlanRepo.count(), 1);
  assert.equal(await liveHistory(), 0);
  // The replaced plan's finished day is kept for progress tracking
  const yesterday = addDays(calendarToday("UTC"), -1);
  assert.deepEqual(await plannedDayRepo.list(userId, yesterday, yesterday), [{ kind: "meal", date: yesterday, planned: current.days[0]!.meals.length }]);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
});
test("development mock reset removes domain data and preserves login credentials; production reset is refused", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const account = await userRepo.findById(userId);
  const plan = await makePlan(); await addStock(userId, "reset:stock", [item]); await mark(plan);
  const env = { ...process.env, DATABASE_URL: database.url };
  await assert.rejects(run(process.execPath, ["--import", "tsx", "src/scripts/reset-mock.ts", "--confirm"], { env: { ...env, NODE_ENV: "production" } }));
  assert.equal(await mealPlanRepo.count(), 1);
  await assert.rejects(run(process.execPath, ["--import", "tsx", "src/scripts/reset-mock.ts"], { env: { ...env, NODE_ENV: "development" } }));
  assert.equal(await foodHistoryRepo.count(), 1);
  await run(process.execPath, ["--import", "tsx", "src/scripts/reset-mock.ts", "--confirm"], { env: { ...env, NODE_ENV: "development" } });
  assert.deepEqual([await mealPlanRepo.count(), await foodHistoryRepo.count(), await pantryRepo.count(), await stockOperationRepo.count(), await scanRepo.count()], [0, 0, 0, 0, 0]);
  const [batches] = await getDb().execute("SELECT COUNT(*) AS n FROM pantry_batches") as unknown as [{ n: number }[]];
  assert.equal(Number(batches[0]!.n), 0, "child rows are removed by ON DELETE CASCADE");
  const preserved = await userRepo.findById(userId);
  assert.equal(preserved!.email, account!.email); assert.equal(preserved!.passwordHash, account!.passwordHash);
  assert.deepEqual(preserved!.preferences, { diet: "none", allergies: [], goal: "balanced", budget: "medium", cuisine: null, dislikes: [] });
});
test("whole-plan replacement refuses a schedule containing only the same protected eaten meals", async () => {
  const plan = await makePlan(); await addStock(userId, "whole-noop:stock", [item]); await mark(plan);
  const current = (await findPlan(plan._id))!;
  const draft = makeDraft(["breakfast"]); draft.days.splice(1);
  const response = await invoke(planRoutes, "/replace", "post", { body: { ...target(current), previewToken: previewToken(draft) } });
  assert.equal(response.status, 409); assert.equal((await findPlan(plan._id))!.status, "active");
  assert.equal(await findPlan(draft._id), null); assert.equal(await liveHistory(), 1);
});
test("a delayed mark retry after undo cannot log the meal again", async () => {
  const plan = await makePlan(); await addStock(userId, "delayed:stock", [item]);
  const request = { params: { id: plan._id, mealId: String(plan.days[0]!.meals[0]!._id) }, body: { timezone: "UTC", revision: plan.__v } };
  assert.equal((await invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", request)).status, 200);
  const entry = (await foodHistoryRepo.findOne({ userId }))!;
  await invoke(historyRoutes, "/:id/undo", "post", { params: { id: String(entry._id) } });
  assert.equal((await invoke(planRoutes, "/:id/meals/:mealId/eaten", "post", request)).status, 409);
  assert.equal(await liveHistory(), 0);
  assert.equal(presentIngredient((await readPantry(userId))[0]!).totals[0]!.quantity, 3);
  assert.equal((await mark(plan)).status, 200);
});

test("previews are not stored, cannot be tampered with, and are bound to their user", async () => {
  const preview = makeDraft();
  assert.equal(await mealPlanRepo.count(), 0);
  const token = previewToken(preview);
  assert.equal((await invoke(planRoutes, "/replace", "post", { body: { ...target(null), previewToken: token + "x" } })).status, 400);
  assert.equal((await invoke(planRoutes, "/replace", "post", { userId: newId(), body: { ...target(null), previewToken: token } })).status, 400);
  const expired = jwt.sign({ plan: preview }, `${process.env.JWT_SECRET!}:meal-plan-preview`, { subject: userId, audience: "meal-plan-preview", expiresIn: -1 });
  assert.equal((await invoke(planRoutes, "/replace", "post", { body: { ...target(null), previewToken: expired } })).status, 400);
  assert.equal(await mealPlanRepo.count(), 0);
  assert.equal((await invoke(planRoutes, "/replace", "post", { body: { ...target(null), previewToken: token } })).status, 200);
  assert.equal(await mealPlanRepo.count(), 1);
});
test("tables are real relational tables: deleting a plan cascades to its days, meals and ingredients", async () => {
  const plan = await makePlan();
  const counts = async () => Promise.all(["meal_plan_days", "meals", "meal_ingredients"].map(async (table) => {
    const [rows] = await getDb().execute(`SELECT COUNT(*) AS n FROM ${table}`) as unknown as [{ n: number }[]];
    return Number(rows[0]!.n);
  }));
  assert.deepEqual(await counts(), [1, 1, 1]);
  await transaction((tx) => mealPlanRepo.delete(tx, plan._id));
  assert.deepEqual(await counts(), [0, 0, 0]);
});
