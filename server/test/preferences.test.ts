import { test } from "node:test";
import assert from "node:assert/strict";
import router from "../src/routes/me.js";
import { userRepo } from "../src/repos/users.js";
import { toPublicUser } from "../src/lib/usage.js";

// Exercise the preferences handler with persistence mocked; no database or AI needed.
const handlerFor = (path: string) => router.stack.find((layer) => layer.route?.path === path)!.route!.stack[0]!.handle;
async function patch(body: unknown, path = "/body") {
  let status = 200;
  let result: any;
  const res = {
    status(code: number) { status = code; return this; },
    json(value: unknown) { result = value; return this; },
  };
  await handlerFor(path)({ userId: "user-id", body } as any, res as any, () => {});
  return { status, result };
}
const publicDocument = { plan: "free", preferences: {}, usage: {} } as any;

test("measurements save with a server timestamp and only the sent fields", async (t) => {
  const update = t.mock.method(userRepo, "updateBody", async () => publicDocument);
  const before = Date.now();
  assert.equal((await patch({ heightCm: 170, weightKg: 65 })).status, 200);
  const args = update.mock.calls[0]!.arguments as any[];
  assert.equal(args[0], "user-id");
  assert.equal(args[1].heightCm, 170);
  assert.equal(args[1].weightKg, 65);
  assert.ok(args[1].weightUpdatedAt.getTime() >= before);
  assert.deepEqual(Object.keys(args[1]).sort(), ["heightCm", "weightKg", "weightUpdatedAt"]);
});

test("invalid measurements cannot reach persistence", async (t) => {
  const update = t.mock.method(userRepo, "updateBody", async () => publicDocument);
  for (const body of [{ heightCm: 0 }, { heightCm: 251 }, { weightKg: -1 }, { weightKg: 501 }, { weightKg: "65" }, { weightKg: Infinity }]) {
    assert.equal((await patch(body)).status, 400);
  }
  assert.equal(update.mock.callCount(), 0);
});

test("other preference changes do not refresh the weight check-in; clearing weight clears its date", async (t) => {
  const prefs = t.mock.method(userRepo, "updatePreferences", async () => publicDocument);
  const body = t.mock.method(userRepo, "updateBody", async () => publicDocument);
  await patch({ goal: "muscle_gain" }, "/preferences");
  assert.deepEqual((prefs.mock.calls[0]!.arguments as any[])[1], { goal: "muscle_gain" });
  await patch({ weightKg: null, heightCm: null });
  assert.equal((body.mock.calls[0]!.arguments as any[])[1].weightUpdatedAt, null);
});

test("personal accounts expose their stored plan and measurements", () => {
  const user = toPublicUser({ plan: "plus", body: { heightCm: 170, weightKg: 65 }, usage: {} } as any);
  assert.equal(user.plan, "plus");
  assert.equal(user.body!.heightCm, 170);
  assert.equal(user.body!.weightKg, 65);
  assert.equal(user.limits.plansPerMonth, null);
});
