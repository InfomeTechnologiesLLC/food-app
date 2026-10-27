import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { isId } from "../db/ids.js";
import { adminAccountRepo, adminSessionRepo } from "../repos/admin.js";
import { userRepo, type UserFilter } from "../repos/users.js";
import { pantryRepo, stockOperationRepo } from "../repos/pantry.js";
import { mealPlanRepo } from "../repos/meal-plans.js";
import { foodHistoryRepo } from "../repos/food-history.js";
import { scanRepo } from "../repos/scans.js";
import { workoutPlanRepo, workoutSessionRepo } from "../repos/workouts.js";
import { bcryptPasswordFits, serializeAdminUser } from "../lib/admin-portal.js";

const router = Router();
const COOKIE = "mealmind_admin";
const SESSION_MS = 8 * 60 * 60 * 1000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const cookieOptions = (production: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure: production, path: "/admin-api", maxAge: SESSION_MS });

router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many login attempts. Try again later." } });
const credentials = z.object({ email: z.string().email(), password: z.string().min(1).refine(bcryptPasswordFits) });

router.post("/auth/login", loginLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid credentials" });
  const email = parsed.data.email.toLowerCase();
  const admin = await adminAccountRepo.findByEmail(email);
  if (!admin || !(await bcrypt.compare(parsed.data.password, admin.passwordHash))) return res.status(401).json({ error: "Invalid credentials" });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await adminSessionRepo.create({ adminId: admin._id, tokenHash: hash(token), expiresAt });
  res.cookie(COOKIE, token, cookieOptions(process.env.NODE_ENV === "production"));
  res.json({ admin: { email: admin.email } });
});

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const rawCookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  const token = rawCookie?.slice(COOKIE.length + 1);
  if (!token || token.length > 128) return res.status(401).json({ error: "Unauthorized" });
  let decoded: string;
  try { decoded = decodeURIComponent(token); } catch { return res.status(401).json({ error: "Unauthorized" }); }
  const session = await adminSessionRepo.findValid(hash(decoded), new Date());
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  const admin = await adminAccountRepo.findEmailById(session.adminId);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });
  res.locals.admin = admin;
  res.locals.adminSession = session;
  next();
}

router.get("/auth/me", authenticate, (_req, res) => res.json({ admin: { email: res.locals.admin.email } }));
router.post("/auth/logout", authenticate, async (_req, res) => {
  await adminSessionRepo.delete(res.locals.adminSession._id);
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin-api" });
  res.status(204).end();
});

router.get("/overview", authenticate, async (_req, res) => {
  const [users, free, plus, onboarded, scans, workoutSessions] = await Promise.all([
    userRepo.count(), userRepo.count({ plan: "free" }), userRepo.count({ plan: "plus" }),
    userRepo.count({ onboarded: true }), scanRepo.count(), workoutSessionRepo.count(),
  ]);
  res.json({ users, free, plus, onboarded, scans, workoutSessions });
});

function pagination(req: Request, res: Response) {
  const schema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid pagination" }); return null; }
  return parsed.data;
}
function pageResult<T>(items: T[], total: number, page: number, limit: number) { return { items, total, page, limit }; }

router.get("/users", authenticate, async (req, res) => {
  const pg = pagination(req, res); if (!pg) return;
  const { search, plan, onboarded } = req.query;
  if (search !== undefined && typeof search !== "string") return res.status(400).json({ error: "Invalid search" });
  if (plan !== undefined && plan !== "free" && plan !== "plus") return res.status(400).json({ error: "Invalid plan" });
  if (onboarded !== undefined && onboarded !== "true" && onboarded !== "false") return res.status(400).json({ error: "Invalid onboarded filter" });
  const filter: UserFilter = {};
  if (plan) filter.plan = plan;
  if (onboarded !== undefined) filter.onboarded = onboarded === "true";
  if (search) {
    if (isId(search)) filter.id = search.toLowerCase();
    else filter.emailContains = search;
  }
  const [items, total] = await Promise.all([userRepo.list(filter, (pg.page - 1) * pg.limit, pg.limit), userRepo.count(filter)]);
  res.json(pageResult(items.map((item) => serializeAdminUser(item as unknown as Record<string, unknown>)), total, pg.page, pg.limit));
});

router.get("/users/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);
  if (!isId(id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await userRepo.findById(id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(serializeAdminUser(user as unknown as Record<string, unknown>));
});

type RecordSource = { list: (userId: string, offset: number, limit: number) => Promise<object[]>; count: (userId: string) => Promise<number> };
const recordSources: Record<string, RecordSource> = {
  pantry: { list: (u, o, l) => pantryRepo.listForAdmin(u, o, l), count: (u) => pantryRepo.count(u) },
  "meal-plans": { list: (u, o, l) => mealPlanRepo.listForAdmin(u, o, l), count: (u) => mealPlanRepo.count({ userId: u }) },
  // Food history includes the pantry deductions (consumed) for debugging.
  "food-history": { list: (u, o, l) => foodHistoryRepo.listForAdmin(u, o, l), count: (u) => foodHistoryRepo.count({ userId: u }) },
  scans: { list: (u, o, l) => scanRepo.listForAdmin(u, o, l), count: (u) => scanRepo.count(u) },
  "workout-plans": { list: (u, o, l) => workoutPlanRepo.listForAdmin(u, o, l), count: (u) => workoutPlanRepo.count({ userId: u }) },
  "workout-sessions": { list: (u, o, l) => workoutSessionRepo.listForAdmin(u, o, l), count: (u) => workoutSessionRepo.count(u) },
  "stock-operations": { list: (u, o, l) => stockOperationRepo.listForAdmin(u, o, l), count: (u) => stockOperationRepo.count(u) },
};
router.get("/users/:id/records/:category", authenticate, async (req, res) => {
  const category = String(req.params.category);
  const id = String(req.params.id);
  if (!isId(id)) return res.status(400).json({ error: "Invalid user id" });
  const source = Object.hasOwn(recordSources, category) ? recordSources[category] : undefined;
  if (!source) return res.status(400).json({ error: "Invalid category" });
  const pg = pagination(req, res); if (!pg) return;
  if (!(await userRepo.exists(id))) return res.status(404).json({ error: "User not found" });
  const [items, total] = await Promise.all([source.list(id, (pg.page - 1) * pg.limit, pg.limit), source.count(id)]);
  res.json(pageResult(items.map(({ __v, ...item }: { __v?: number }) => item), total, pg.page, pg.limit));
});

export default router;
