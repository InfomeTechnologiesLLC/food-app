import { Router } from "express";
import { z } from "zod";
import { isId } from "../db/ids.js";
import { transaction } from "../db/tx.js";
import { pantryRepo } from "../repos/pantry.js";
import { userRepo } from "../repos/users.js";
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
const validIds = (ingredientId: unknown, batchId: unknown) => isId(ingredientId) && isId(batchId);
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
  const { ingredientId, batchId } = req.params as { ingredientId: string; batchId: string };
  if (!validIds(ingredientId, batchId)) return res.status(404).json({ error: "Batch not found" });
  const parsed = itemSchema.omit({ source: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const found = await transaction(async (tx) => {
    await userRepo.lock(req.userId!, tx);
    const ingredient = await pantryRepo.findById(ingredientId, req.userId!, tx);
    const batch = ingredient?.batches.find((item) => item._id === batchId);
    if (!ingredient || !batch) return false;
    const next = canonicalStock({ ...parsed.data, source: batch.source });
    const values = { quantity: next.quantity, unit: next.unit, expiryDate: next.expiryDate };
    if (ingredient.key === next.name) {
      await pantryRepo.setCategory(tx, ingredient._id, next.category);
      await pantryRepo.updateBatch(tx, ingredient._id, batchId, values);
    } else {
      // Renamed: move the batch to the ingredient with the new name (created if needed).
      const target = await pantryRepo.ensureIngredient(tx, { userId: req.userId!, key: next.name, name: next.name, category: next.category });
      await pantryRepo.moveBatch(tx, batchId, ingredient._id, target, values);
    }
    return true;
  });
  if (!found) return res.status(404).json({ error: "Batch not found" });
  res.json((await readPantry(req.userId!)).map(presentIngredient));
});

router.delete("/:ingredientId/batches/:batchId", async (req: AuthRequest, res) => {
  const { ingredientId, batchId } = req.params as { ingredientId: string; batchId: string };
  if (!validIds(ingredientId, batchId)) return res.status(404).json({ error: "Batch not found" });
  const found = await transaction(async (tx) => {
    await userRepo.lock(req.userId!, tx);
    const ingredient = await pantryRepo.findById(ingredientId, req.userId!, tx);
    if (!ingredient?.batches.some((batch) => batch._id === batchId)) return false;
    await pantryRepo.removeBatch(tx, ingredient._id, batchId);
    return true;
  });
  if (!found) return res.status(404).json({ error: "Batch not found" });
  res.status(204).end();
});
export default router;
