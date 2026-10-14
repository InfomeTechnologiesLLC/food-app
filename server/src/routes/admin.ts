import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import mongoose, { Types } from "mongoose";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AdminAccount } from "../models/AdminAccount.js";
import { AdminSession } from "../models/AdminSession.js";
import { User } from "../models/User.js";
import { PantryIngredient } from "../models/PantryIngredient.js";
import { MealPlan } from "../models/MealPlan.js";
import { FoodHistory } from "../models/FoodHistory.js";
import { Scan } from "../models/Scan.js";
import { WorkoutPlan, WorkoutSession } from "../models/Workout.js";
import { StockOperation } from "../models/StockOperation.js";
import { bcryptPasswordFits, escapeRegex, serializeAdminUser } from "../lib/admin-portal.js";

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
  const admin = await AdminAccount.findOne({ email });
  if (!admin || !(await bcrypt.compare(parsed.data.password, admin.passwordHash))) return res.status(401).json({ error: "Invalid credentials" });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await AdminSession.create({ adminId: admin._id, tokenHash: hash(token), expiresAt });
  res.cookie(COOKIE, token, cookieOptions(process.env.NODE_ENV === "production"));
  res.json({ admin: { email: admin.email } });
});

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const rawCookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  const token = rawCookie?.slice(COOKIE.length + 1);
  if (!token || token.length > 128) return res.status(401).json({ error: "Unauthorized" });
  let decoded: string;
  try { decoded = decodeURIComponent(token); } catch { return res.status(401).json({ error: "Unauthorized" }); }
  const session = await AdminSession.findOne({ tokenHash: hash(decoded), expiresAt: { $gt: new Date() } });
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  const admin = await AdminAccount.findById(session.adminId).select("email");
  if (!admin) return res.status(401).json({ error: "Unauthorized" });
  res.locals.admin = admin;
  res.locals.adminSession = session;
  next();
}

router.get("/auth/me", authenticate, (_req, res) => res.json({ admin: { email: res.locals.admin.email } }));
router.post("/auth/logout", authenticate, async (_req, res) => {
  await AdminSession.deleteOne({ _id: res.locals.adminSession._id });
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin-api" });
  res.status(204).end();
});

router.get("/overview", authenticate, async (_req, res) => {
  const [users, free, plus, onboarded, scans, workoutSessions] = await Promise.all([
    User.countDocuments(), User.countDocuments({ plan: "free" }), User.countDocuments({ plan: "plus" }),
    User.countDocuments({ onboarded: true }), Scan.countDocuments(), WorkoutSession.countDocuments(),
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
  const filter: Record<string, unknown> = {};
  if (plan) filter.plan = plan;
  if (onboarded !== undefined) filter.onboarded = onboarded === "true";
  if (search) {
    if (Types.ObjectId.isValid(search) && String(new Types.ObjectId(search)) === search.toLowerCase()) filter._id = search;
    else filter.email = { $regex: escapeRegex(search), $options: "i" };
  }
  const [items, total] = await Promise.all([User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((pg.page - 1) * pg.limit).limit(pg.limit).lean(), User.countDocuments(filter)]);
  res.json(pageResult(items.map((item) => serializeAdminUser(item as Record<string, unknown>)), total, pg.page, pg.limit));
});

router.get("/users/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await User.findById(id).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(serializeAdminUser(user as Record<string, unknown>));
});

const recordModels = {
  pantry: PantryIngredient, "meal-plans": MealPlan, "food-history": FoodHistory, scans: Scan,
  "workout-plans": WorkoutPlan, "workout-sessions": WorkoutSession, "stock-operations": StockOperation,
} as const;
const categories = Object.keys(recordModels) as Array<keyof typeof recordModels>;
router.get("/users/:id/records/:category", authenticate, async (req, res) => {
  const category = req.params.category as keyof typeof recordModels;
  const id = String(req.params.id);
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user id" });
  if (!categories.includes(category)) return res.status(400).json({ error: "Invalid category" });
  const pg = pagination(req, res); if (!pg) return;
  if (!(await User.exists({ _id: id }))) return res.status(404).json({ error: "User not found" });
  const Model = recordModels[category] as typeof PantryIngredient;
  const sort: Record<string, 1 | -1> = category === "food-history" ? { recordedAt: -1, _id: -1 } : { createdAt: -1, _id: -1 };
  const [items, total] = await Promise.all([
    Model.find({ userId: new mongoose.Types.ObjectId(id) }).select(category === "food-history" ? "+consumed -__v" : "-__v").sort(sort).skip((pg.page - 1) * pg.limit).limit(pg.limit).lean(),
    Model.countDocuments({ userId: new mongoose.Types.ObjectId(id) }),
  ]);
  res.json(pageResult(items, total, pg.page, pg.limit));
});

export default router;
