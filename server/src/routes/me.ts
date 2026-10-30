import { Router } from "express";
import { z } from "zod";
import { userRepo, type UserDoc } from "../repos/users.js";
import { waterRepo } from "../repos/water.js";
import { ACTIVITY_LEVELS, SEXES } from "../lib/targets.js";
import { DIETS } from "../lib/food-prefs.js";
import { targetsForUser } from "../lib/user-targets.js";
import { isId } from "../db/ids.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { trainingSchema, exerciseById } from "../domain/exercise.js";
import { toPublicUser } from "../lib/usage.js";
import { weightRepo } from "../repos/weights.js";
import { addDays, dateSchema } from "../lib/calendar.js";
import { plannedDayRepo } from "../repos/planned-days.js";

const router = Router();
router.use(requireAuth);

const preferencesSchema = z.object({
  diet: z.enum(DIETS),
  allergies: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20),
  goal: z.enum(["balanced", "weight_loss", "muscle_gain"]),
  budget: z.enum(["low", "medium", "high"]),
  cuisine: z.string().trim().min(2).max(60).nullable(),
  dislikes: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30),
});

router.patch("/preferences", async (req: AuthRequest, res) => {
  const parsed = preferencesSchema.partial().strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await userRepo.updatePreferences(req.userId!, parsed.data);
  if (!user) return res.status(401).json({ error: "Account not found" });
  res.json(toPublicUser(user));
});

const thisYear = () => new Date().getUTCFullYear();
const bodySchema = z.object({
  heightCm: z.number().min(50).max(250).nullable(),
  weightKg: z.number().min(10).max(500).nullable(),
  targetWeightKg: z.number().min(10).max(500).nullable(),
  sex: z.enum(SEXES).nullable(),
  // Ages 10 to 110
  birthYear: z.number().int().refine((y) => y >= thisYear() - 110 && y <= thisYear() - 10).nullable(),
  activityLevel: z.enum(ACTIVITY_LEVELS).nullable(),
  goalWeeks: z.number().int().min(1).max(260).nullable(),
}).partial().strict();

router.patch('/body', async (req: AuthRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body measurements' });
  const set: Partial<UserDoc['body']> = { ...parsed.data };
  if (parsed.data.weightKg !== undefined) set.weightUpdatedAt = parsed.data.weightKg === null ? null : new Date();
  const user = await userRepo.updateBody(req.userId!, set);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  res.json(toPublicUser(user));
});
router.patch('/training', async (req: AuthRequest, res) => {
  const parsed = trainingSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.excludedExercises.some(id => !exerciseById(id))) return res.status(400).json({ error: 'Invalid training preferences' });
  const user = await userRepo.updateTraining(req.userId!, parsed.data);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  res.json(toPublicUser(user));
});

// Weigh-ins: one per calendar day. The newest one also becomes the current weight on the profile.
const weightBody = z.object({ weightKg: z.number().min(10).max(500) }).strict();
/** The client's local date can be a day ahead of the server's UTC date, never more. */
const notTooFarAhead = (date: string) => date <= addDays(new Date().toISOString().slice(0, 10), 1);
async function syncCurrentWeight(userId: string) {
  const [latest] = await weightRepo.list(userId, 1);
  if (latest) await userRepo.updateBody(userId, { weightKg: latest.weightKg, weightUpdatedAt: latest.recordedAt });
}
router.get("/weights", async (req: AuthRequest, res) => {
  const parsed = z.object({ limit: z.coerce.number().int().min(1).max(400).default(120) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid weight query" });
  res.json((await weightRepo.list(req.userId!, parsed.data.limit)).map(({ date, weightKg }) => ({ date, weightKg })));
});
router.put("/weights/:date", async (req: AuthRequest, res) => {
  const date = dateSchema.safeParse(req.params.date);
  const body = weightBody.safeParse(req.body);
  if (!date.success || !notTooFarAhead(date.data) || !body.success) return res.status(400).json({ error: "Invalid weigh-in" });
  await weightRepo.upsert(req.userId!, date.data, body.data.weightKg);
  await syncCurrentWeight(req.userId!);
  res.json({ date: date.data, weightKg: body.data.weightKg });
});

// Daily calorie, macro and water targets from the profile (see lib/targets.ts)
router.get("/targets", async (req: AuthRequest, res) => {
  const user = await userRepo.findById(req.userId!);
  if (!user) return res.status(401).json({ error: "Account not found" });
  res.json(targetsForUser(user));
});

// Water: each drink is one row, so the last one can be undone
const waterDay = async (userId: string, date: string) => {
  const user = await userRepo.findById(userId);
  return { ...(await waterRepo.day(userId, date)), goalMl: user ? targetsForUser(user).waterMl : 2000 };
};
// Water per day for a date range (Progress & tracking)
router.get("/water", async (req: AuthRequest, res) => {
  const q = z.object({ from: dateSchema, to: dateSchema }).strict().refine((r) => r.from <= r.to && r.to <= addDays(r.from, 400)).safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "Invalid date range" });
  const user = await userRepo.findById(req.userId!);
  res.json({ goalMl: user ? targetsForUser(user).waterMl : 2000, days: await waterRepo.totals(req.userId!, q.data.from, q.data.to) });
});
router.get("/water/:date", async (req: AuthRequest, res) => {
  const date = dateSchema.safeParse(req.params.date);
  if (!date.success) return res.status(400).json({ error: "Invalid date" });
  res.json(await waterDay(req.userId!, date.data));
});
router.post("/water/:date", async (req: AuthRequest, res) => {
  const date = dateSchema.safeParse(req.params.date);
  const body = z.object({ amountMl: z.number().int().min(50).max(2000) }).strict().safeParse(req.body);
  if (!date.success || !notTooFarAhead(date.data) || !body.success) return res.status(400).json({ error: "Invalid water entry" });
  await waterRepo.add(req.userId!, date.data, body.data.amountMl);
  res.status(201).json(await waterDay(req.userId!, date.data));
});
router.delete("/water/entries/:id", async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const date = isId(id) ? await waterRepo.remove(req.userId!, id) : null;
  if (!date) return res.status(404).json({ error: "Water entry not found" });
  res.json(await waterDay(req.userId!, date));
});

// What was planned on past days whose plan has since been replaced or deleted (see lib/planned-days.ts)
router.get("/planned-days", async (req: AuthRequest, res) => {
  const parsed = z.object({ from: dateSchema, to: dateSchema }).strict()
    .refine((q) => q.from <= q.to && q.to <= addDays(q.from, 400)).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid date range" });
  res.json(await plannedDayRepo.list(req.userId!, parsed.data.from, parsed.data.to));
});
export default router;
