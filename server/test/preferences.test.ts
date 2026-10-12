import { test } from "node:test";
import assert from "node:assert/strict";
import router from "../src/routes/me.js";
import { User } from "../src/models/User.js";
import { toPublicUser } from "../src/lib/usage.js";

// Exercise the preferences handler with persistence mocked; no database or AI needed.
const handler = router.stack.find((layer) => layer.route?.path === "/preferences")!.route!.stack[0]!.handle;
async function patch(body: unknown) {
  let status = 200;
  let result: any;
  const res = {
    status(code: number) { status = code; return this; },
    json(value: unknown) { result = value; return this; },
  };
  await handler({ userId: "user-id", body } as any, res as any, () => {});
  return { status, result };
}
const publicDocument = { toObject: () => ({ plan: "free", preferences: {}, usage: {} }) };

test("measurements save with a server timestamp and remove legacy serving preferences", async (t) => {
  const update = t.mock.method(User, "findByIdAndUpdate", async () => publicDocument);
  const before = Date.now();
  assert.equal((await patch({ heightCm: 170, weightKg: 65, servings: 6, weightUpdatedAt: "1900-01-01" })).status, 200);
  const args = update.mock.calls[0]!.arguments as any[];
  assert.equal(args[1].$set["preferences.heightCm"], 170);
  assert.equal(args[1].$set["preferences.weightKg"], 65);
  assert.ok(args[1].$set["preferences.weightUpdatedAt"].getTime() >= before);
  assert.equal(args[1].$set["preferences.servings"], undefined);
  assert.deepEqual(args[1].$unset, { "preferences.servings": "" });
  assert.equal(args[2].strict, false);
});

test("invalid measurements cannot reach persistence", async (t) => {
  const update = t.mock.method(User, "findByIdAndUpdate", async () => publicDocument);
  for (const body of [{ heightCm: 0 }, { heightCm: 251 }, { weightKg: -1 }, { weightKg: 501 }, { weightKg: "65" }, { weightKg: Infinity }]) {
    assert.equal((await patch(body)).status, 400);
  }
  assert.equal(update.mock.callCount(), 0);
});

test("other preference changes do not refresh the weight check-in; clearing weight clears its date", async (t) => {
  const update = t.mock.method(User, "findByIdAndUpdate", async () => publicDocument);
  await patch({ goal: "muscle_gain" });
  assert.equal((update.mock.calls[0]!.arguments as any[])[1].$set["preferences.weightUpdatedAt"], undefined);
  await patch({ weightKg: null, heightCm: null });
  assert.equal((update.mock.calls[1]!.arguments as any[])[1].$set["preferences.weightUpdatedAt"], null);
});

test("old household accounts expose a personal plan without servings", () => {
  const user = toPublicUser({ toObject: () => ({ plan: "family", preferences: { servings: 6, heightCm: 170 }, usage: {} }) });
  assert.equal(user.plan, "plus");
  assert.equal(user.preferences.servings, undefined);
  assert.equal(user.preferences.heightCm, 170);
  assert.equal(user.limits.plansPerMonth, null);
});
