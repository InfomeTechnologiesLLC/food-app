import { Router } from "express";
import { z } from "zod";
import mongoose, { isValidObjectId } from "mongoose";
import { PantryIngredient } from "../models/PantryIngredient.js";
import { PANTRY_CATEGORIES } from "../domain/pantry.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { addStock, canonicalStock } from "../lib/add-stock.js";
import { presentIngredient, readPantry } from "../lib/pantry.js";

const router = Router();
router.use(requireAuth);
const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1).max(20),
  category: z.enum(PANTRY_CATEGORIES),
  expiryDate: z.coerce.date().nullable(),
  source: z.enum(["groceries", "receipt", "manual"]).default("manual"),
});
const validIds = (ingredientId: unknown, batchId: unknown) => isValidObjectId(ingredientId) && isValidObjectId(batchId);
router.get("/", async (req: AuthRequest, res) => res.json((await readPantry(req.userId!)).map(presentIngredient)));

router.post("/", async (req: AuthRequest, res) => {
  const parsed = itemSchema.safeParse(req.body);
  const key = req.get("Idempotency-Key");
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!key || key.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(key)) return res.status(400).json({ error: "A valid save key is required." });
  await addStock(req.userId!, `manual:${key}`, [parsed.data]);
  res.status(201).json((await readPantry(req.userId!)).map(presentIngredient));
});

router.patch("/:ingredientId/batches/:batchId", async (req: AuthRequest, res) => {
  if (!validIds(req.params.ingredientId, req.params.batchId)) return res.status(404).json({ error: "Batch not found" });
  const parsed = itemSchema.omit({ source: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const found = await mongoose.connection.transaction(async (session) => {
    const ingredient = await PantryIngredient.findOne({ _id: req.params.ingredientId, userId: req.userId }).session(session);
    const batch = ingredient?.batches.find((item) => String(item._id) === req.params.batchId);
    if (!ingredient || !batch) return false;
    const next = canonicalStock({ ...parsed.data, source: batch.source });
    const replacement = { _id: batch._id, quantity: next.quantity, unit: next.unit, expiryDate: next.expiryDate, source: next.source };
    if (ingredient.key === next.name) {
      ingredient.category = next.category;
      ingredient.batches = ingredient.batches.map((item) => String(item._id) === req.params.batchId ? replacement : item);
      await ingredient.save({ session });
    } else {
      await PantryIngredient.findOneAndUpdate({ userId: req.userId, key: next.name }, {
        $setOnInsert: { userId: req.userId, key: next.name, name: next.name, category: next.category },
        $push: { batches: replacement },
      }, { upsert: true, session, runValidators: true });
      ingredient.batches = ingredient.batches.filter((item) => String(item._id) !== req.params.batchId);
      if (ingredient.batches.length) await ingredient.save({ session });
      else await ingredient.deleteOne({ session });
    }
    return true;
  });
  if (!found) return res.status(404).json({ error: "Batch not found" });
  res.json((await readPantry(req.userId!)).map(presentIngredient));
});

router.delete("/:ingredientId/batches/:batchId", async (req: AuthRequest, res) => {
  if (!validIds(req.params.ingredientId, req.params.batchId)) return res.status(404).json({ error: "Batch not found" });
  const found = await mongoose.connection.transaction(async (session) => {
    const ingredient = await PantryIngredient.findOne({ _id: req.params.ingredientId, userId: req.userId }).session(session);
    if (!ingredient?.batches.some((batch) => String(batch._id) === req.params.batchId)) return false;
    ingredient.batches = ingredient.batches.filter((batch) => String(batch._id) !== req.params.batchId);
    if (ingredient.batches.length) await ingredient.save({ session });
    else await ingredient.deleteOne({ session });
    return true;
  });
  if (!found) return res.status(404).json({ error: "Batch not found" });
  res.status(204).end();
});
export default router;
