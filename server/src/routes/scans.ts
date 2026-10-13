import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { scanImage } from "../ai/scan.js";
import { AIError } from "../ai/gemini.js";
import { Scan } from "../models/Scan.js";
import { PANTRY_CATEGORIES } from "../domain/pantry.js";
import { consumeUsage, refundUsage } from "../lib/usage.js";
import { stockScan } from "../lib/stock-scan.js";
import { readPantry, presentIngredient } from "../lib/pantry.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, imageMime(file) !== null),
});

/** Some clients send a generic content type, so fall back to the file extension. */
function imageMime(file: { mimetype: string; originalname: string }) {
  if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) return file.mimetype;
  const ext = file.originalname.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
  return (ext && byExt[ext]) || null;
}

router.post("/", upload.single("image"), async (req: AuthRequest, res) => {
  const type = z.enum(["groceries", "receipt"]).safeParse(req.body.type);
  if (!type.success) return res.status(400).json({ error: "type must be 'groceries' or 'receipt'" });
  if (!req.file) return res.status(400).json({ error: "Please attach a JPEG, PNG or WebP image under 8 MB." });

  if (!(await consumeUsage(req.userId!, "scansThisMonth"))) {
    return res.status(402).json({ error: "You've used all your free scans this month. Upgrade to Plus for unlimited scans.", code: "LIMIT_REACHED" });
  }

  try {
    const items = await scanImage(req.file.buffer, imageMime(req.file)!, type.data);
    const scan = await Scan.create({ userId: req.userId, type: type.data, aiItems: items });
    res.status(201).json({ scanId: scan.id, type: type.data, items });
  } catch (err) {
    await refundUsage(req.userId!, "scansThisMonth");
    if (err instanceof AIError) return res.status(err.status).json({ error: err.message });
    console.error("scan failed", err);
    res.status(502).json({ error: "Couldn't analyze the photo. Please try again." });
  }
});

const confirmSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        quantity: z.number().positive(),
        unit: z.string().trim().max(20),
        category: z.enum(PANTRY_CATEGORIES),
        expiryDate: z.coerce.date().nullable(),
      })
    )
    .min(1)
    .max(100),
});

// The user has reviewed/edited the AI draft; only now does it reach the pantry.
router.post("/:id/confirm", async (req: AuthRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "Scan not found" });
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = await stockScan(req.userId!, req.params.id as string, parsed.data.items);
  if (!created) return res.status(409).json({ error: "This scan was already saved or doesn't exist." });
  res.status(201).json((await readPantry(req.userId!)).map(presentIngredient));
});

export default router;
