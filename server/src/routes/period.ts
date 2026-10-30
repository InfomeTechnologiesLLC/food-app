import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { userRepo, type UserDoc } from "../repos/users.js";
import { periodRepo } from "../repos/period.js";
import { GENERAL_COMFORT_FOODS, periodStatus } from "../lib/period.js";
import { addDays, dateSchema } from "../lib/calendar.js";
import { isId } from "../db/ids.js";
import { isDuplicateKey } from "../db/tx.js";
import { PAIN_LEVELS, PERIOD_EXERCISE } from "../db/schema.js";

/**
 * Period tracking for female users who switch it on in their profile.
 * GET /period?today=YYYY-MM-DD gives the settings, recent periods, today's status and pain answer.
 */
const router = Router();
router.use(requireAuth);

const available = (user: UserDoc) => user.body.sex === "female";
/** The client's local date can be a day ahead of the server's UTC date, never more. */
const notTooFarAhead = (date: string) => date <= addDays(new Date().toISOString().slice(0, 10), 1);

async function overview(user: UserDoc, today: string) {
  const logs = await periodRepo.list(user._id);
  const status = periodStatus(logs, user.period, today);
  const [checkin] = status.onPeriod ? await periodRepo.pains(user._id, today, today) : [];
  return {
    available: available(user),
    settings: user.period,
    logs,
    status,
    pain: checkin?.pain ?? null,
    comfort: { mine: user.period.comfortFoods, general: GENERAL_COMFORT_FOODS },
  };
}

router.get("/", async (req: AuthRequest, res) => {
  const today = dateSchema.safeParse(req.query.today);
  if (!today.success) return res.status(400).json({ error: "Invalid date" });
  const user = await userRepo.findById(req.userId!);
  if (!user) return res.status(401).json({ error: "Account not found" });
  res.json(await overview(user, today.data));
});

const settingsSchema = z.object({
  tracking: z.boolean(),
  exercise: z.enum(PERIOD_EXERCISE),
  comfortFoods: z.array(z.string().trim().min(1).max(60)).max(20),
  cycleLength: z.number().int().min(21).max(45),
  periodLength: z.number().int().min(2).max(10),
}).partial().strict();

router.patch("/settings", async (req: AuthRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid period settings" });
  const user = await userRepo.findById(req.userId!);
  if (!user) return res.status(401).json({ error: "Account not found" });
  if (parsed.data.tracking && !available(user)) return res.status(400).json({ error: "Period tracking is for female profiles. Set your sex in Body and goal first." });
  const updated = await userRepo.updatePeriod(req.userId!, parsed.data);
  res.json(updated!.period);
});

const logSchema = z.object({ startDate: dateSchema, endDate: dateSchema.nullable().default(null), today: dateSchema }).strict()
  .refine((b) => !b.endDate || (b.endDate >= b.startDate && b.endDate <= addDays(b.startDate, 14)), { message: "The last day must be within two weeks after the first day." })
  .refine((b) => notTooFarAhead(b.startDate) && (!b.endDate || notTooFarAhead(b.endDate)), { message: "Dates can't be in the future." });

async function trackingUser(req: AuthRequest, res: import("express").Response) {
  const user = await userRepo.findById(req.userId!);
  if (!user) { res.status(401).json({ error: "Account not found" }); return null; }
  if (!user.period.tracking || !available(user)) { res.status(400).json({ error: "Turn on period tracking in your profile first." }); return null; }
  return user;
}

router.post("/logs", async (req: AuthRequest, res) => {
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid period dates" });
  const user = await trackingUser(req, res);
  if (!user) return;
  await periodRepo.upsert(user._id, parsed.data.startDate, parsed.data.endDate);
  res.status(201).json(await overview(user, parsed.data.today));
});

router.patch("/logs/:id", async (req: AuthRequest, res) => {
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success || !isId(req.params.id)) return res.status(400).json({ error: parsed.success ? "Invalid period" : parsed.error.issues[0]?.message ?? "Invalid period dates" });
  const user = await trackingUser(req, res);
  if (!user) return;
  if (!(await periodRepo.find(user._id, req.params.id as string))) return res.status(404).json({ error: "Period not found" });
  try {
    await periodRepo.update(user._id, req.params.id as string, { startDate: parsed.data.startDate, endDate: parsed.data.endDate });
  } catch (err) {
    if (isDuplicateKey(err)) return res.status(409).json({ error: "Another period already starts on that day." });
    throw err;
  }
  res.json(await overview(user, parsed.data.today));
});

router.delete("/logs/:id", async (req: AuthRequest, res) => {
  const today = dateSchema.safeParse(req.query.today);
  if (!today.success || !isId(req.params.id)) return res.status(400).json({ error: "Invalid request" });
  const user = await userRepo.findById(req.userId!);
  if (!user) return res.status(401).json({ error: "Account not found" });
  if (!(await periodRepo.remove(user._id, req.params.id as string))) return res.status(404).json({ error: "Period not found" });
  res.json(await overview(user, today.data));
});

/** Today's pain answer: none, mild or strong. */
router.put("/pain/:date", async (req: AuthRequest, res) => {
  const date = dateSchema.safeParse(req.params.date);
  const body = z.object({ pain: z.enum(PAIN_LEVELS) }).strict().safeParse(req.body);
  if (!date.success || !notTooFarAhead(date.data) || !body.success) return res.status(400).json({ error: "Invalid pain answer" });
  const user = await trackingUser(req, res);
  if (!user) return;
  await periodRepo.setPain(user._id, date.data, body.data.pain);
  res.json(await overview(user, date.data));
});

export default router;
