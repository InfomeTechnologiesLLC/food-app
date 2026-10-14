import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import adminRouter from "../src/routes/admin.js";
import { AdminAccount } from "../src/models/AdminAccount.js";
import { AdminSession } from "../src/models/AdminSession.js";
import { User } from "../src/models/User.js";
import { FoodHistory } from "../src/models/FoodHistory.js";
import { escapeRegex, serializeAdminUser } from "../src/lib/admin-portal.js";
import { bcryptPasswordFits } from "../src/lib/admin-portal.js";

test("admin HTTP boundary authenticates sessions and scopes safe paginated data", async () => {
  assert.equal(escapeRegex("a.+(b)"), "a\\.\\+\\(b\\)");
  assert.equal(bcryptPasswordFits("a".repeat(72)), true);
  assert.equal(bcryptPasswordFits("a".repeat(73)), false);
  assert.equal(bcryptPasswordFits("😀".repeat(18)), true);
  assert.equal(bcryptPasswordFits("😀".repeat(19)), false);
  assert.deepEqual(serializeAdminUser({ _id: "id", email: "a@b.co", passwordHash: "secret", pushTokens: ["x"], unknown: 1 }), { _id: "id", email: "a@b.co" });

  const originals = new Map<any, Map<string, unknown>>();
  const replace = (target: any, key: string, value: unknown) => {
    if (!originals.has(target)) originals.set(target, new Map());
    originals.get(target)!.set(key, target[key]);
    target[key] = value;
  };
  const userId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const passwordHash = await bcrypt.hash("correct horse battery staple", 4);
  const account = { _id: adminId, email: "admin@example.com", passwordHash };
  let session: any = null;
  let lastFilter: any;
  let lastRecordFind: any;
  let recordSelect = "";
  let recordPagination = { skip: -1, limit: -1 };
  const profile = { _id: userId, email: "person@example.com", plan: "plus", onboarded: true, preferences: { diet: "none" }, body: { weightKg: 60 }, training: {}, usage: {}, scheduleRevision: 4, createdAt: new Date(), updatedAt: new Date(), passwordHash: "secret", pushTokens: ["secret"], accidental: "secret" };
  const makeQuery = (data: any) => {
    const q: any = { select: () => q, sort: () => q, skip: (n: number) => { recordPagination.skip = n; return q; }, limit: (n: number) => { recordPagination.limit = n; return q; }, lean: () => Promise.resolve(data) };
    return q;
  };

  replace(AdminAccount, "findOne", async (filter: any) => filter.email === account.email ? account : null);
  replace(AdminAccount, "findById", () => ({ select: async () => ({ email: account.email }) }));
  replace(AdminSession, "create", async (doc: any) => { session = { ...doc, _id: new Types.ObjectId() }; return session; });
  replace(AdminSession, "findOne", async (filter: any) => session && session.tokenHash === filter.tokenHash && session.expiresAt > filter.expiresAt.$gt ? session : null);
  replace(AdminSession, "deleteOne", async (filter: any) => { if (String(session?._id) === String(filter._id)) session = null; return { deletedCount: 1 }; });
  replace(User, "find", (filter: any) => { lastFilter = filter; return makeQuery([profile]); });
  replace(User, "countDocuments", async (filter: any) => { lastFilter = filter; return 1; });
  replace(User, "findById", () => makeQuery(profile));
  replace(User, "exists", async () => ({ _id: userId }));
  replace(FoodHistory, "find", (filter: any) => { lastRecordFind = filter; const q = makeQuery([{ _id: "row", consumed: [{ name: "debug" }] }]); const select = q.select; q.select = (value: string) => { recordSelect = value; return select(value); }; q.skip = (n: number) => { recordPagination.skip = n; return q; }; q.limit = (n: number) => { recordPagination.limit = n; return q; }; return q; });
  replace(FoodHistory, "countDocuments", async (filter: any) => { lastRecordFind = filter; return 1; });

  const app = express();
  const call = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const req = Object.create(express.request) as Request;
    Object.assign(req, { app, method: init.method ?? "GET", url: path, originalUrl: path, baseUrl: "", headers: Object.fromEntries(headers.entries()), socket: { remoteAddress: "127.0.0.1" }, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const responseHeaders = new Headers();
    const res: any = Object.create(express.response);
    Object.assign(res, { app, req, locals: {}, statusCode: 200, setHeader: (name: string, value: string) => responseHeaders.set(name, value), getHeader: (name: string) => responseHeaders.get(name), status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { responseHeaders.set("content-type", "application/json"); this.body = JSON.stringify(value); this.finished = true; return this; }, cookie(name: string, value: string, options: any) { responseHeaders.set("set-cookie", `${name}=${encodeURIComponent(value)}; Path=${options.path}; Max-Age=${options.maxAge / 1000}; HttpOnly; SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}${options.secure ? "; Secure" : ""}`); return this; }, clearCookie(name: string, options: any) { responseHeaders.set("set-cookie", `${name}=; Path=${options.path}; Max-Age=0; HttpOnly; SameSite=Lax`); return this; }, end() { this.finished = true; return this; } });
    return new Promise<{ status: number; headers: Headers; body: string }>((resolve, reject) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve({ status: res.statusCode, headers: responseHeaders, body: res.body ?? "" }); };
      const origJson = res.json.bind(res); res.json = (value: unknown) => { const out = origJson(value); finish(); return out; };
      const origEnd = res.end.bind(res); res.end = (...args: any[]) => { const out = origEnd(...args); finish(); return out; };
      adminRouter.handle(req, res, (err?: unknown) => { if (err) reject(err); else finish(); });
    });
  };
  const json = (data: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const cookieInit = (cookie: string, method = "GET") => ({ method, headers: { cookie } });
  try {
    const unauth = await call("/auth/me", { headers: { authorization: "Bearer mobile-jwt" } });
    assert.equal(unauth.status, 401); assert.equal(unauth.headers.get("cache-control"), "no-store");
    const oversized = await call("/auth/login", json({ email: account.email, password: "x".repeat(73) })); assert.equal(oversized.status, 400);
    const badLogin = await call("/auth/login", json({ email: "admin@example.com", password: "wrong" }));
    assert.equal(badLogin.status, 401);
    const login = await call("/auth/login", json({ email: account.email, password: "correct horse battery staple" }));
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie"); assert.ok(setCookie?.includes("HttpOnly")); assert.ok(setCookie?.includes("Path=/admin-api")); assert.ok(setCookie?.includes("SameSite=Lax"));
    const cookie = setCookie!.split(";")[0];
    assert.ok(session.tokenHash); assert.notEqual(session.tokenHash, decodeURIComponent(cookie.split("=")[1])); assert.ok(session.expiresAt.getTime() > Date.now() + 7.9 * 60 * 60 * 1000);

    const me = await call("/auth/me", cookieInit(cookie)); assert.deepEqual(JSON.parse(me.body), { admin: { email: account.email } });
    session.expiresAt = new Date(Date.now() - 1);
    const expired = await call("/auth/me", cookieInit(cookie)); assert.equal(expired.status, 401);
    session.expiresAt = new Date(Date.now() + 60_000);

    const invalidId = await call("/users/nope", cookieInit(cookie)); assert.equal(invalidId.status, 400);
    const badFilter = await call("/users?plan=enterprise", cookieInit(cookie)); assert.equal(badFilter.status, 400);
    const users = await call("/users?search=person.%2B%40example.com&plan=plus&onboarded=true&page=2&limit=10", cookieInit(cookie));
    assert.equal(users.status, 200);
    const payload: any = JSON.parse(users.body); assert.deepEqual(payload.items[0], JSON.parse(JSON.stringify(serializeAdminUser(profile)))); assert.equal(payload.total, 1); assert.equal(payload.page, 2); assert.equal(payload.limit, 10);
    assert.deepEqual(lastFilter, { plan: "plus", onboarded: true, email: { $regex: "person\\.\\+@example\\.com", $options: "i" } });
    assert.equal(recordPagination.skip, 10); assert.equal(recordPagination.limit, 10);

    const records = await call(`/users/${userId}/records/food-history?page=3&limit=5`, cookieInit(cookie));
    assert.equal(records.status, 200); assert.deepEqual(lastRecordFind, { userId }); assert.equal(recordSelect, "+consumed -__v");
    assert.equal(recordPagination.skip, 10); assert.equal(recordPagination.limit, 5);

    const logout = await call("/auth/logout", cookieInit(cookie, "POST")); assert.equal(logout.status, 204);
    const afterLogout = await call("/auth/me", cookieInit(cookie)); assert.equal(afterLogout.status, 401);
  } finally {
    for (const [target, fields] of originals) for (const [key, value] of fields) target[key] = value;
  }
});
