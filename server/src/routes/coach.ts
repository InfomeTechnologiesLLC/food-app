import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { AIError } from "../ai/gemini.js";
import { MEAL_TYPES } from "../ai/plan.js";
import { chatMessageSchema, coachChat, suggestNextMeal } from "../ai/coach.js";
import { consumeUsage, refundUsage } from "../lib/usage.js";
import { loadUser, todaySummary } from "../lib/coach-data.js";
import { runWeeklyCheckIn } from "../lib/weekly-check-in.js";
import { targetChangeRepo } from "../repos/target-changes.js";
import { aiFailure } from "../ai/schema.js";
import { devDetail } from "./food-log.js";
import { addDays, calendarToday, dateSchema, timezoneSchema } from "../lib/calendar.js";

const router = Router();
router.use(requireAuth);
const LIMIT_MESSAGE = "You've used all your free AI coach requests this month. Upgrade to Plus for unlimited coaching.";

/** The app sends its local date and hour. The date may differ from the server's by a day at most. */
const clockSchema = z.object({ date: dateSchema, hour: z.coerce.number().min(0).max(23.99), timezone: timezoneSchema });
const validClock = (c: { date: string; timezone: string }) => {
  const today = calendarToday(c.timezone);
  return c.date >= addDays(today, -1) && c.date <= addDays(today, 1);
};

/** Today's targets, intake, what is left, water and workout. Also runs the weekly check-in when it is due. No AI. */
router.get("/today", async (req: AuthRequest, res) => {
  const clock = clockSchema.safeParse(req.query);
  if (!clock.success || !validClock(clock.data)) return res.status(400).json({ error: "Invalid date" });
  const checkIn = await runWeeklyCheckIn(req.userId!, clock.data.date);
  const user = await loadUser(req.userId!);
  res.json({ ...(await todaySummary(user, clock.data.date)), checkIn: checkIn.ran ? checkIn : null });
});

/** History of calorie changes made by weekly check-ins, newest first. */
router.get("/target-changes", async (req: AuthRequest, res) => {
  res.json(await targetChangeRepo.list(req.userId!));
});

router.post("/next-meal", async (req: AuthRequest, res) => {
  const body = clockSchema.extend({ mealType: z.enum(MEAL_TYPES).optional() }).strict().safeParse(req.body);
  if (!body.success || !validClock(body.data)) return res.status(400).json({ error: "Invalid request" });
  if (!(await consumeUsage(req.userId!, "coachThisMonth"))) return res.status(402).json({ error: LIMIT_MESSAGE, code: "LIMIT_REACHED" });
  try {
    const result = await suggestNextMeal(req.userId!, body.data.date, body.data.hour, body.data.mealType);
    // Answers that needed no AI don't count
    if (result.status !== "suggested") await refundUsage(req.userId!, "coachThisMonth");
    res.json(result);
  } catch (err) {
    await refundUsage(req.userId!, "coachThisMonth");
    if (err instanceof AIError) return res.status(err.status).json({ error: err.message });
    console.error("next meal failed:", aiFailure(err));
    res.status(502).json({ error: "Couldn't suggest a meal. Please try again.", ...devDetail(err) });
  }
});

router.post("/chat", async (req: AuthRequest, res) => {
  const body = clockSchema.extend({
    // Recent conversation, oldest first; the last message is the user's new one
    messages: z.array(chatMessageSchema).min(1).max(20).refine((m) => m.at(-1)!.role === "user"),
  }).strict().safeParse(req.body);
  if (!body.success || !validClock(body.data)) return res.status(400).json({ error: "Invalid message" });
  if (!(await consumeUsage(req.userId!, "coachThisMonth"))) return res.status(402).json({ error: LIMIT_MESSAGE, code: "LIMIT_REACHED" });
  try {
    res.json(await coachChat({ userId: req.userId!, date: body.data.date, hour: body.data.hour }, body.data.messages));
  } catch (err) {
    await refundUsage(req.userId!, "coachThisMonth");
    if (err instanceof AIError) return res.status(err.status).json({ error: err.message });
    console.error("coach chat failed:", aiFailure(err));
    res.status(502).json({ error: "The coach couldn't answer. Please try again.", ...devDetail(err) });
  }
});

export default router;
