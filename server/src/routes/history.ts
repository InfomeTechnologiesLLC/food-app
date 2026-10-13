import { Router } from "express";
import { z } from "zod";
import { isValidObjectId, Types } from "mongoose";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { FoodHistory } from "../models/FoodHistory.js";
import { dateSchema } from "../lib/calendar.js";
import { scheduleTransaction, undoEntry } from "../lib/schedule.js";
const router = Router();
router.use(requireAuth);
const cursorSchema = z.object({ date: dateSchema, id: z.string().refine(isValidObjectId) });
router.get("/", async (req: AuthRequest, res) => {
  const parsed = z.object({ date: dateSchema.optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid history query" });
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (parsed.data.cursor) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(parsed.data.cursor, "base64url").toString())); }
    catch { return res.status(400).json({ error: "Invalid history cursor" }); }
  }
  const filter = { userId: new Types.ObjectId(req.userId), reversed: false, ...(parsed.data.date ? { date: parsed.data.date } : {}) };
  const rows = await FoodHistory.find({ ...filter, ...(cursor ? { $or: [{ date: { $lt: cursor.date } }, { date: cursor.date, _id: { $lt: new Types.ObjectId(cursor.id) } }] } : {}) })
    .sort({ date: -1, _id: -1 }).limit(parsed.data.limit + 1).lean();
  const more = rows.length > parsed.data.limit;
  const entries = rows.slice(0, parsed.data.limit);
  const dates = [...new Set(entries.map((entry) => entry.date))];
  const totals = await FoodHistory.aggregate([
    { $match: { ...filter, date: { $in: dates } } },
    { $group: { _id: "$date", meals: { $sum: 1 }, calories: { $sum: "$meal.calories" }, proteinGrams: { $sum: "$meal.nutrition.proteinGrams" }, carbsGrams: { $sum: "$meal.nutrition.carbsGrams" }, fatGrams: { $sum: "$meal.nutrition.fatGrams" } } },
  ]);
  const last = entries.at(-1);
  res.json({ entries, totals: Object.fromEntries(totals.map(({ _id, ...total }) => [_id, total])),
    nextCursor: more && last ? Buffer.from(JSON.stringify({ date: last.date, id: String(last._id) })).toString("base64url") : null });
});
router.post("/:id/undo", async (req: AuthRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "History entry not found" });
  await scheduleTransaction(req.userId!, (session) => undoEntry(req.userId!, req.params.id as string, session));
  res.status(204).end();
});
export default router;
