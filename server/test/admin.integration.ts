import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import express from "express";
import mongoose, { Types } from "mongoose";
import adminRouter from "../src/routes/admin.js";
import { AdminAccount } from "../src/models/AdminAccount.js";
import { AdminSession } from "../src/models/AdminSession.js";
import { User } from "../src/models/User.js";
import { PantryIngredient } from "../src/models/PantryIngredient.js";
import { MealPlan } from "../src/models/MealPlan.js";
import { FoodHistory } from "../src/models/FoodHistory.js";
import { Scan } from "../src/models/Scan.js";
import { WorkoutPlan, WorkoutSession } from "../src/models/Workout.js";
import { StockOperation } from "../src/models/StockOperation.js";

const dbName = `mmad_${Date.now()}_${randomBytes(4).toString("hex")}`;
const adminEmail = "integration-admin@example.test";
const adminPassword = `First-password-${randomBytes(12).toString("hex")}`;
const changedPassword = `Changed-password-${randomBytes(12).toString("hex")}`;
const passwordHash = (token: string) => createHash("sha256").update(token).digest("hex");
const models = [User, PantryIngredient, MealPlan, FoodHistory, Scan, WorkoutPlan, WorkoutSession, StockOperation, AdminAccount, AdminSession];

function httpRequest(base: string, path: string, init?: RequestInit) { return fetch(`${base}${path}`, init); }
function recordSnapshot() {
  return Promise.all([User, PantryIngredient, MealPlan, FoodHistory, Scan, WorkoutPlan, WorkoutSession, StockOperation].map((model) => model.countDocuments()));
}

test("admin seed and real HTTP sessions expose scoped read-only user data", async () => {
  assert.ok(process.env.MONGODB_URI, "MONGODB_URI is required for this isolated integration test");
  const uri = new URL(process.env.MONGODB_URI!);
  uri.pathname = `/${dbName}`;
  const isolatedUri = uri.toString();
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 15000 });
  let server: http.Server | undefined;
  try {
    await Promise.all(models.map((model) => model.init()));
    const env = { ...process.env, MONGODB_URI: isolatedUri, ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword };
    const seedArgs = ["--import", "tsx", "src/scripts/seed-admin.ts"];
    execFileSync(process.execPath, seedArgs, { cwd: process.cwd(), env, stdio: "pipe", timeout: 60000 });
    execFileSync(process.execPath, seedArgs, { cwd: process.cwd(), env: { ...env, ADMIN_PASSWORD: changedPassword }, stdio: "pipe", timeout: 60000 });
    assert.equal(await AdminAccount.countDocuments(), 1);

    const first = await User.create({ email: "first@example.test", passwordHash: "mobile-hash", plan: "plus", onboarded: true });
    const second = await User.create({ email: "second@example.test", passwordHash: "another-mobile-hash", plan: "free", onboarded: false });
    let firstPantryId: Types.ObjectId | undefined;
    for (const user of [first, second]) {
      const marker = user.email.startsWith("first") ? "first" : "second";
      const pantry = await PantryIngredient.create({ userId: user._id, key: `${marker}-beans`, name: `${marker} beans`, category: "canned", batches: [{ quantity: 2, unit: "can", expiryDate: null, source: "manual" }] });
      if (marker === "first") firstPantryId = pantry._id;
      await MealPlan.create({ userId: user._id, title: `${marker} meal plan`, status: "active", days: [], settingsSnapshot: { diet: "none", allergies: [], goal: "balanced", budget: "medium", mealTypes: ["breakfast"] } });
      await FoodHistory.create({ userId: user._id, mealId: new Types.ObjectId(), sourcePlanId: new Types.ObjectId(), sourcePlanTitle: `${marker} plan`, date: "2026-10-14", recordedAt: new Date(), meal: { type: "breakfast", title: `${marker} history`, description: "integration fixture", prepMinutes: 1, calories: 100, nutrition: { proteinGrams: 2, carbsGrams: 10, fatGrams: 3 }, ingredients: [], steps: [] }, consumed: [{ ingredientKey: `${marker}-beans`, batchId: new Types.ObjectId(), name: `${marker} beans`, amount: 1, unit: "can", category: "canned", expiryDate: null, source: "manual" }] });
      await Scan.create({ userId: user._id, type: "receipt", aiItems: [{ marker }] });
      await WorkoutPlan.create({ userId: user._id, title: `${marker} workout`, status: "draft", days: [], context: { marker } });
      await WorkoutSession.create({ _id: `${marker}-${user.id}`, userId: user._id, revision: 1, operationId: `${marker}-operation`, date: "2026-10-14", status: "finished", exercises: [] });
      await StockOperation.create({ userId: user._id, key: `${marker}-stock`, fingerprint: `${marker}-fingerprint`, items: [{ name: `${marker} beans`, quantity: 2, unit: "can", category: "canned", expiryDate: null, source: "manual" }], batches: [{ ingredientId: new Types.ObjectId(), batchId: new Types.ObjectId() }] });
    }
    // Add a second row for pagination while preserving the same user scope.
    await PantryIngredient.create({ userId: first._id, key: "first-rice", name: "first rice", category: "grains", batches: [{ quantity: 1, unit: "kg", expiryDate: null, source: "manual" }] });
    await PantryIngredient.collection.updateOne({ _id: firstPantryId }, { $set: { createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z") } });

    const app = express(); app.use(express.json()); app.use("/admin-api", adminRouter);
    server = http.createServer(app);
    await new Promise<void>((resolve, reject) => server!.listen(0, "127.0.0.1", (err?: Error) => err ? reject(err) : resolve()));
    const addr = server.address(); assert.ok(addr && typeof addr !== "string");
    const base = `http://127.0.0.1:${addr.port}/admin-api`;
    const login = await httpRequest(base, "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
    assert.equal(login.status, 200);
    const cookieHeader = login.headers.get("set-cookie"); assert.ok(cookieHeader);
    assert.match(cookieHeader, /HttpOnly/i); assert.match(cookieHeader, /SameSite=Lax/i); assert.match(cookieHeader, /Path=\/admin-api/i);
    const cookie = cookieHeader.split(";")[0]!;
    const token = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
    const session = await AdminSession.findOne({ tokenHash: passwordHash(token) }); assert.ok(session);
    assert.ok(session.expiresAt.getTime() > Date.now() + 7.9 * 60 * 60 * 1000);
    assert.equal((await httpRequest(base, "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: changedPassword }) })).status, 401);

    const bearer = await httpRequest(base, "/overview", { headers: { authorization: "Bearer mobile-token" } }); assert.equal(bearer.status, 401);
    const me = await httpRequest(base, "/auth/me", { headers: { cookie } }); assert.equal(me.status, 200); assert.deepEqual(await me.json(), { admin: { email: adminEmail } });
    const overview = await httpRequest(base, "/overview", { headers: { cookie } }); assert.equal(overview.headers.get("cache-control"), "no-store"); assert.deepEqual(await overview.json(), { users: 2, free: 1, plus: 1, onboarded: 1, scans: 2, workoutSessions: 2 });

    const list = await httpRequest(base, "/users?plan=plus&onboarded=true&page=1&limit=1", { headers: { cookie } });
    const listPayload: any = await list.json(); assert.equal(list.status, 200); assert.equal(listPayload.total, 1); assert.equal(listPayload.items.length, 1);
    assert.equal(listPayload.items[0].email, first.email); assert.equal("passwordHash" in listPayload.items[0], false); assert.equal("pushTokens" in listPayload.items[0], false);
    const paged = await httpRequest(base, `/users/${first.id}/records/pantry?page=2&limit=1`, { headers: { cookie } });
    const pageData: any = await paged.json(); assert.equal(pageData.total, 2); assert.equal(pageData.items.length, 1); assert.equal(pageData.items[0].name, "first bean");

    for (const category of ["pantry", "meal-plans", "food-history", "scans", "workout-plans", "workout-sessions", "stock-operations"]) {
      const response = await httpRequest(base, `/users/${first.id}/records/${category}`, { headers: { cookie } });
      assert.equal(response.status, 200, category);
      const data: any = await response.json(); const expectedTotal = category === "pantry" ? 2 : 1; assert.equal(data.total, expectedTotal, category); assert.equal(data.items.length, expectedTotal, category);
      const serialized = JSON.stringify(data.items);
      assert.equal(serialized.includes("second"), false, `${category} leaked another user's record`);
      if (category === "food-history") assert.equal(data.items[0].consumed[0].name, "first beans");
    }
    const before = await recordSnapshot();
    await httpRequest(base, "/overview", { headers: { cookie } });
    for (const category of ["pantry", "meal-plans", "food-history", "scans", "workout-plans", "workout-sessions", "stock-operations"]) await httpRequest(base, `/users/${first.id}/records/${category}`, { headers: { cookie } });
    assert.deepEqual(await recordSnapshot(), before, "admin reads changed user records");

    await AdminSession.updateOne({ _id: session._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await httpRequest(base, "/auth/me", { headers: { cookie } })).status, 401, "expired session stayed valid");
    const logoutLogin = await httpRequest(base, "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
    const logoutCookie = logoutLogin.headers.get("set-cookie")!.split(";")[0]!;
    const logout = await httpRequest(base, "/auth/logout", { method: "POST", headers: { cookie: logoutCookie } }); assert.equal(logout.status, 204);
    assert.equal((await httpRequest(base, "/auth/me", { headers: { cookie: logoutCookie } })).status, 401);
  } finally {
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((err) => err ? reject(err) : resolve()));
    try { await mongoose.connection.db!.dropDatabase(); } finally { await mongoose.disconnect(); }
  }
});
