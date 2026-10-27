import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import express from "express";
import adminRouter from "../src/routes/admin.js";
import { createTestDatabase } from "./helpers/mysql.js";
import { getDb } from "../src/db/client.js";
import { newId } from "../src/db/ids.js";
import { transaction } from "../src/db/tx.js";
import { pantryIngredients } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { adminAccountRepo, adminSessionRepo } from "../src/repos/admin.js";
import { userRepo } from "../src/repos/users.js";
import { pantryRepo, stockOperationRepo } from "../src/repos/pantry.js";
import { buildPlan, mealPlanRepo } from "../src/repos/meal-plans.js";
import { foodHistoryRepo } from "../src/repos/food-history.js";
import { scanRepo } from "../src/repos/scans.js";
import { workoutPlanRepo, workoutSessionRepo } from "../src/repos/workouts.js";

const adminEmail = "integration-admin@example.test";
const adminPassword = `First-password-${randomBytes(12).toString("hex")}`;
const changedPassword = `Changed-password-${randomBytes(12).toString("hex")}`;
const passwordHash = (token: string) => createHash("sha256").update(token).digest("hex");

function httpRequest(base: string, path: string, init?: RequestInit) { return fetch(`${base}${path}`, init); }
function recordSnapshot() {
  return Promise.all([userRepo.count(), pantryRepo.count(), mealPlanRepo.count(), foodHistoryRepo.count(), scanRepo.count(), workoutPlanRepo.count(), workoutSessionRepo.count(), stockOperationRepo.count()]);
}

test("admin seed and real HTTP sessions expose scoped read-only user data", async () => {
  const database = await createTestDatabase("mealmind_admin_test");
  const isolatedUri = database.url;
  let server: http.Server | undefined;
  try {
    const env = { ...process.env, DATABASE_URL: isolatedUri, ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword };
    const seedArgs = ["--import", "tsx", "src/scripts/seed-admin.ts"];
    execFileSync(process.execPath, seedArgs, { cwd: process.cwd(), env, stdio: "pipe", timeout: 60000 });
    execFileSync(process.execPath, seedArgs, { cwd: process.cwd(), env: { ...env, ADMIN_PASSWORD: changedPassword }, stdio: "pipe", timeout: 60000 });
    assert.equal(await adminAccountRepo.count(), 1);

    const first = await userRepo.create({ email: "first@example.test", passwordHash: "mobile-hash", plan: "plus", onboarded: true });
    const second = await userRepo.create({ email: "second@example.test", passwordHash: "another-mobile-hash", plan: "free", onboarded: false });
    let firstPantryId: string | undefined;
    for (const user of [first, second]) {
      const marker = user.email.startsWith("first") ? "first" : "second";
      const userId = user._id;
      await transaction(async (tx) => {
        const pantryId = await pantryRepo.create(tx, { userId, key: `${marker}-beans`, name: `${marker} beans`, category: "canned", batches: [{ quantity: 2, unit: "can", expiryDate: null, source: "manual" }] });
        if (marker === "first") firstPantryId = pantryId;
        await mealPlanRepo.insert(tx, buildPlan({ userId, title: `${marker} meal plan`, days: [], settingsSnapshot: { diet: "none", allergies: [], goal: "balanced", budget: "medium", mealTypes: ["breakfast"] } }));
        await foodHistoryRepo.create(tx, { _id: newId(), userId, mealId: newId(), sourcePlanId: newId(), sourcePlanTitle: `${marker} plan`, date: "2026-10-14", recordedAt: new Date(), meal: { type: "breakfast", title: `${marker} history`, description: "integration fixture", prepMinutes: 1, calories: 100, nutrition: { proteinGrams: 2, carbsGrams: 10, fatGrams: 3 }, ingredients: [], steps: [], allergyWarnings: [] }, consumed: [{ ingredientKey: `${marker}-beans`, batchId: newId(), name: `${marker} beans`, amount: 1, unit: "can", category: "canned", expiryDate: null, source: "manual" }] });
        await scanRepo.create({ userId, type: "receipt", aiItems: [{ marker }] }, tx);
        await workoutPlanRepo.create({ userId, title: `${marker} workout`, status: "draft", days: [], context: { marker } }, tx);
        await workoutSessionRepo.create({ _id: `${marker}-${userId}`, userId, revision: 1, operationId: `${marker}-operation`, date: "2026-10-14", status: "finished", exercises: [] }, tx);
        await stockOperationRepo.create(tx, { userId, key: `${marker}-stock`, fingerprint: createHash("sha256").update(marker).digest("hex"), items: [{ name: `${marker} beans`, quantity: 2, unit: "can", category: "canned", expiryDate: null, source: "manual" }], batches: [{ ingredientId: newId(), batchId: newId() }] });
      });
    }
    // Add a second row for pagination while preserving the same user scope.
    await transaction((tx) => pantryRepo.create(tx, { userId: first._id, key: "first-rice", name: "first rice", category: "grains", batches: [{ quantity: 1, unit: "kg", expiryDate: null, source: "manual" }] }));
    await getDb().update(pantryIngredients).set({ createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z") }).where(eq(pantryIngredients.id, firstPantryId!));

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
    const session = await adminSessionRepo.findByTokenHash(passwordHash(token)); assert.ok(session);
    assert.ok(session.expiresAt.getTime() > Date.now() + 7.9 * 60 * 60 * 1000);
    assert.equal((await httpRequest(base, "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: changedPassword }) })).status, 401);

    const bearer = await httpRequest(base, "/overview", { headers: { authorization: "Bearer mobile-token" } }); assert.equal(bearer.status, 401);
    const me = await httpRequest(base, "/auth/me", { headers: { cookie } }); assert.equal(me.status, 200); assert.deepEqual(await me.json(), { admin: { email: adminEmail } });
    const overview = await httpRequest(base, "/overview", { headers: { cookie } }); assert.equal(overview.headers.get("cache-control"), "no-store"); assert.deepEqual(await overview.json(), { users: 2, free: 1, plus: 1, onboarded: 1, scans: 2, workoutSessions: 2 });

    const list = await httpRequest(base, "/users?plan=plus&onboarded=true&page=1&limit=1", { headers: { cookie } });
    const listPayload: any = await list.json(); assert.equal(list.status, 200); assert.equal(listPayload.total, 1); assert.equal(listPayload.items.length, 1);
    assert.equal(listPayload.items[0].email, first.email); assert.equal("passwordHash" in listPayload.items[0], false); assert.equal("pushTokens" in listPayload.items[0], false);
    const paged = await httpRequest(base, `/users/${first._id}/records/pantry?page=2&limit=1`, { headers: { cookie } });
    const pageData: any = await paged.json(); assert.equal(pageData.total, 2); assert.equal(pageData.items.length, 1); assert.equal(pageData.items[0].name, "first bean");

    for (const category of ["pantry", "meal-plans", "food-history", "scans", "workout-plans", "workout-sessions", "stock-operations"]) {
      const response = await httpRequest(base, `/users/${first._id}/records/${category}`, { headers: { cookie } });
      assert.equal(response.status, 200, category);
      const data: any = await response.json(); const expectedTotal = category === "pantry" ? 2 : 1; assert.equal(data.total, expectedTotal, category); assert.equal(data.items.length, expectedTotal, category);
      const serialized = JSON.stringify(data.items);
      assert.equal(serialized.includes("second"), false, `${category} leaked another user's record`);
      if (category === "food-history") assert.equal(data.items[0].consumed[0].name, "first beans");
    }
    const before = await recordSnapshot();
    await httpRequest(base, "/overview", { headers: { cookie } });
    for (const category of ["pantry", "meal-plans", "food-history", "scans", "workout-plans", "workout-sessions", "stock-operations"]) await httpRequest(base, `/users/${first._id}/records/${category}`, { headers: { cookie } });
    assert.deepEqual(await recordSnapshot(), before, "admin reads changed user records");

    await adminSessionRepo.setExpiry(session._id, new Date(Date.now() - 1000));
    assert.equal((await httpRequest(base, "/auth/me", { headers: { cookie } })).status, 401, "expired session stayed valid");
    const logoutLogin = await httpRequest(base, "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
    const logoutCookie = logoutLogin.headers.get("set-cookie")!.split(";")[0]!;
    const logout = await httpRequest(base, "/auth/logout", { method: "POST", headers: { cookie: logoutCookie } }); assert.equal(logout.status, 204);
    assert.equal((await httpRequest(base, "/auth/me", { headers: { cookie: logoutCookie } })).status, 401);
  } finally {
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((err) => err ? reject(err) : resolve()));
    await database.drop();
  }
});
