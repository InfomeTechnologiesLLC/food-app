import { Router } from "express";
import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { PantryItem, PANTRY_CATEGORIES } from "../models/PantryItem.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// No .default()s here: they would also fire on PATCH and overwrite fields the client didn't send.
// Mongoose schema defaults cover creation.
const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.number().positive().optional(),
  unit: z.string().trim().max(20).optional(),
  category: z.enum(PANTRY_CATEGORIES).optional(),
  expiryDate: z.coerce.date().nullable().optional(),
  source: z.enum(["groceries", "receipt", "manual", "fridge"]).optional(),
});

router.get("/", async (req: AuthRequest, res) => {
  // Soonest-expiring first; items without an expiry go last
  const items = await PantryItem.find({ userId: req.userId }).sort({ expiryDate: 1, name: 1 }).lean();
  items.sort((a, b) => (a.expiryDate ? 0 : 1) - (b.expiryDate ? 0 : 1));
  res.json(items);
});

router.post("/", async (req: AuthRequest, res) => {
  // Accepts a single item or an array (the scan confirm flow sends many)
  const body = Array.isArray(req.body) ? req.body : [req.body];
  const parsed = z.array(itemSchema).min(1).max(100).safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const created = await PantryItem.insertMany(parsed.data.map((i) => ({ ...i, userId: req.userId })));
  res.status(201).json(Array.isArray(req.body) ? created : created[0]);
});

router.patch("/:id", async (req: AuthRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const item = await PantryItem.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, parsed.data, { new: true });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

router.delete("/:id", async (req: AuthRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
  const result = await PantryItem.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!result.deletedCount) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

export default router;
