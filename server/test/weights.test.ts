import { test } from "node:test";
import assert from "node:assert/strict";
import router from "../src/routes/me.js";
import { userRepo } from "../src/repos/users.js";
import { weightRepo } from "../src/repos/weights.js";

// Weigh-in handlers with persistence mocked; no database needed.
const handlerFor = (method: string, path: string) => router.stack.find((l) => l.route?.path === path && (l.route as any).methods[method])!.route!.stack[0]!.handle;
async function call(method: string, path: string, req: Record<string, unknown>) {
  let status = 200; let result: any;
  const res = { status(code: number) { status = code; return this; }, json(v: unknown) { result = v; return this; }, end() { return this; } };
  await handlerFor(method, path)({ userId: "user-id", ...req } as any, res as any, () => {});
  return { status, result };
}
const today = new Date().toISOString().slice(0, 10);

test("a weigh-in is stored for its date and becomes the current weight", async (t) => {
  const upsert = t.mock.method(weightRepo, "upsert", async () => {});
  const recordedAt = new Date();
  t.mock.method(weightRepo, "list", async () => [{ date: today, weightKg: 70.5, recordedAt }]);
  const body = t.mock.method(userRepo, "updateBody", async () => ({}) as any);
  const out = await call("put", "/weights/:date", { params: { date: today }, body: { weightKg: 70.5 } });
  assert.equal(out.status, 200);
  assert.deepEqual(upsert.mock.calls[0]!.arguments.slice(0, 3), ["user-id", today, 70.5]);
  assert.deepEqual(body.mock.calls[0]!.arguments, ["user-id", { weightKg: 70.5, weightUpdatedAt: recordedAt }]);
});

test("invalid weigh-ins never reach persistence", async (t) => {
  const upsert = t.mock.method(weightRepo, "upsert", async () => {});
  for (const [date, weightKg] of [["not-a-date", 70], ["2999-01-01", 70], [today, 9], [today, 501], [today, "70"]] as const) {
    assert.equal((await call("put", "/weights/:date", { params: { date }, body: { weightKg } })).status, 400);
  }
  assert.equal((await call("put", "/weights/:date", { params: { date: today }, body: { weightKg: 70, extra: 1 } })).status, 400);
  assert.equal(upsert.mock.callCount(), 0);
});

test("target weight is accepted on the body route and can be cleared", async (t) => {
  const body = t.mock.method(userRepo, "updateBody", async () => ({ plan: "free", usage: {} }) as any);
  assert.equal((await call("patch", "/body", { body: { targetWeightKg: 62 } })).status, 200);
  assert.deepEqual((body.mock.calls[0]!.arguments as any[])[1], { targetWeightKg: 62 });
  assert.equal((await call("patch", "/body", { body: { targetWeightKg: null } })).status, 200);
  assert.equal((await call("patch", "/body", { body: { targetWeightKg: 5 } })).status, 400);
});

test("history lists newest first with only date and weight", async (t) => {
  t.mock.method(weightRepo, "list", async () => [{ date: today, weightKg: 70, recordedAt: new Date() }]);
  assert.deepEqual((await call("get", "/weights", { query: {} })).result, [{ date: today, weightKg: 70 }]);
});
