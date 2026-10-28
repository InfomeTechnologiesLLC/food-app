import { Router } from "express";
import { z } from "zod";
import { userRepo } from "../repos/users.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { trainingSchema, exerciseById } from "../domain/exercise.js";
import { toPublicUser } from "../lib/usage.js";
import { weightRepo } from "../repos/weights.js";
import { addDays, dateSchema } from "../lib/calendar.js";
import { plannedDayRepo } from "../repos/planned-days.js";

const router = Router();
router.use(requireAuth);

const preferencesSchema = z.object({
  diet: z.enum(["none", "vegetarian", "vegan", "pescatarian", "keto", "halal", "kosher"]),
  allergies: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20),
  goal: z.enum(["balanced", "weight_loss", "muscle_gain"]),
  budget: z.enum(["low", "medium", "high"]),
});

router.patch("/preferences", async (req: AuthRequest, res) => {
  const parsed = preferencesSchema.partial().strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await userRepo.updatePreferences(req.userId!, parsed.data);
  if (!user) return res.status(401).json({ error: "Account not found" });
  res.json(toPublicUser(user));
});

router.patch('/body', async (req: AuthRequest, res) => {
  const parsed = z.object({ heightCm: z.number().min(50).max(250).nullable(), weightKg: z.number().min(10).max(500).nullable(), targetWeightKg: z.number().min(10).max(500).nullable() }).partial().strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body measurements' });
  const set: { heightCm?: number | null; weightKg?: number | null; weightUpdatedAt?: Date | null; targetWeightKg?: number | null } = { ...parsed.data };
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

// What was planned on past days whose plan has since been replaced or deleted (see lib/planned-days.ts)
router.get("/planned-days", async (req: AuthRequest, res) => {
  const parsed = z.object({ from: dateSchema, to: dateSchema }).strict()
    .refine((q) => q.from <= q.to && q.to <= addDays(q.from, 400)).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid date range" });
  res.json(await plannedDayRepo.list(req.userId!, parsed.data.from, parsed.data.to));
});
export default router;
