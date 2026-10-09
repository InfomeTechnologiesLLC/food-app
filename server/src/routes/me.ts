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
  servings: z.number().int().min(1).max(12),
});

router.patch("/preferences", async (req: AuthRequest, res) => {
  const parsed = preferencesSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const set = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [`preferences.${k}`, v]));
  const user = await User.findByIdAndUpdate(
    req.userId,
    { $set: { ...set, onboarded: true } },
    { new: true }
  );
  if (!user) return res.status(401).json({ error: "Account not found" });
  res.json(toPublicUser(user));
});

export default router;
