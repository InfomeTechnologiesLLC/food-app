import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { estimateFood } from "../ai/food-estimate.js";
import { AIError } from "../ai/gemini.js";
import { consumeUsage, refundUsage } from "../lib/usage.js";
import { foodLogSchema, logFood } from "../lib/food-log.js";
import { userRepo } from "../repos/users.js";
import { addDays } from "../lib/calendar.js";
import { aiFailure } from "../ai/schema.js";
import { env } from "../env.js";

/** While developing, the app also shows why the AI failed (never in production). */
export const devDetail = (err: unknown) => (env.NODE_ENV === "production" ? {} : { detail: aiFailure(err) });

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const IMAGE = /^image\/(jpeg|png|webp|heic|heif)$/;
const LIMIT_MESSAGE = "You've used all your free AI coach requests this month. Upgrade to Plus for unlimited coaching.";

/** Draft estimate from a description or a plate photo. Nothing is saved: the app shows it for the user to check. */
router.post("/estimate", upload.single("image"), async (req: AuthRequest, res) => {
  const text = z.string().trim().min(2).max(500).optional().safeParse(req.body?.text || undefined);
  const image = req.file && IMAGE.test(req.file.mimetype) ? { data: req.file.buffer, mimeType: req.file.mimetype } : undefined;
  if (!text.success || (!text.data && !image)) return res.status(400).json({ error: "Describe what you ate, or attach a JPEG, PNG or WebP photo under 8 MB." });
  if (!(await consumeUsage(req.userId!, "coachThisMonth"))) return res.status(402).json({ error: LIMIT_MESSAGE, code: "LIMIT_REACHED" });
  try {
    res.json(await estimateFood({ text: text.data, image }));
  } catch (err) {
    await refundUsage(req.userId!, "coachThisMonth");
    if (err instanceof AIError) return res.status(err.status).json({ error: err.message });
    console.error("food estimate failed:", aiFailure(err));
    res.status(502).json({ error: "Couldn't estimate that. Please try again.", ...devDetail(err) });
  }
});

/** Saves the (possibly edited) estimate as eaten. */
router.post("/", async (req: AuthRequest, res) => {
  const parsed = foodLogSchema.safeParse(req.body);
  const today = new Date().toISOString().slice(0, 10);
  if (!parsed.success || parsed.data.date > addDays(today, 1) || parsed.data.date < addDays(today, -7)) {
    return res.status(400).json({ error: "Invalid food entry" });
  }
  const user = await userRepo.findById(req.userId!);
  if (!user) return res.status(401).json({ error: "Account not found" });
  const id = await logFood(req.userId!, parsed.data, user.preferences.allergies);
  res.status(201).json({ historyEntryId: id });
});

export default router;
