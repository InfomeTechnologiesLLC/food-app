import { Router } from "express";
import { z } from "zod";
import { userRepo } from "../repos/users.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { trainingSchema, exerciseById } from "../domain/exercise.js";
import { toPublicUser } from "../lib/usage.js";

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
  const parsed = z.object({ heightCm: z.number().min(50).max(250).nullable(), weightKg: z.number().min(10).max(500).nullable() }).partial().strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body measurements' });
  const set: { heightCm?: number | null; weightKg?: number | null; weightUpdatedAt?: Date | null } = { ...parsed.data };
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
export default router;
