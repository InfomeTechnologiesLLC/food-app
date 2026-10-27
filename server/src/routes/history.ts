import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { foodHistoryRepo } from "../repos/food-history.js";
import { isId } from "../db/ids.js";
import { dateSchema } from "../lib/calendar.js";
import { scheduleTransaction, undoEntry } from "../lib/schedule.js";
const router = Router();
router.use(requireAuth);
const cursorSchema = z.object({ date: dateSchema, id: z.string().refine(isId) });
router.get("/", async (req: AuthRequest, res) => {
  const parsed = z.object({ date: dateSchema.optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid history query" });
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (parsed.data.cursor) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(parsed.data.cursor, "base64url").toString())); }
    catch { return res.status(400).json({ error: "Invalid history cursor" }); }
  }
  const filter = { userId: req.userId!, reversed: false, ...(parsed.data.date ? { date: parsed.data.date } : {}) };
  const rows = await foodHistoryRepo.page(filter, cursor, parsed.data.limit + 1);
  const more = rows.length > parsed.data.limit;
  const entries = rows.slice(0, parsed.data.limit);
  const dates = [...new Set(entries.map((entry) => entry.date))];
  const totals = await foodHistoryRepo.totalsByDate(filter, dates);
  const last = entries.at(-1);
  res.json({ entries, totals: Object.fromEntries(totals.map(({ date, ...total }) => [date, total])),
    nextCursor: more && last ? Buffer.from(JSON.stringify({ date: last.date, id: String(last._id) })).toString("base64url") : null });
});
router.post("/:id/undo", async (req: AuthRequest, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: "History entry not found" });
  await scheduleTransaction(req.userId!, (tx) => undoEntry(req.userId!, req.params.id as string, tx));
  res.status(204).end();
});
export default router;
