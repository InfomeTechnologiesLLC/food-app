import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { toPublicUser } from "../lib/usage.js";

const router = Router();
router.use(requireAuth);

const preferencesSchema = z.object({
  diet: z.enum(["none", "vegetarian", "vegan", "pescatarian", "keto", "halal", "kosher"]),
  allergies: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20),
  goal: z.enum(["balanced", "weight_loss", "muscle_gain", "budget"]),
  budget: z.enum(["low", "medium", "high"]),
  heightCm: z.number().min(50).max(250).nullable(),
  weightKg: z.number().min(10).max(500).nullable(),
});

router.patch("/preferences", async (req: AuthRequest, res) => {
  const parsed = preferencesSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const set: Record<string, unknown> = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [`preferences.${k}`, v]));
  if (parsed.data.weightKg !== undefined) {
    set["preferences.weightUpdatedAt"] = parsed.data.weightKg === null ? null : new Date();
  }
  const user = await User.findByIdAndUpdate(
    req.userId,
    { $set: { ...set, onboarded: true } },
    { returnDocument: "after", runValidators: true }
  );
  if (!user) return res.status(401).json({ error: "Account not found" });
  res.json(toPublicUser(user));
});

export default router;
