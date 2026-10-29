import jwt from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { generatePlan, MEAL_TYPES } from "../ai/plan.js";
import { AIError } from "../ai/gemini.js";
import { stockShoppingItem } from "../lib/stock-shopping.js";
import { buildShoppingList, shoppingRows } from "../lib/shopping.js";
import { consumeIngredients, PantryShortage } from "../lib/consume.js";
import { annotateReadiness } from "../lib/readiness.js";
import { consumeUsage, refundUsage } from "../lib/usage.js";
import { pantryStock, readPantry } from "../lib/pantry.js";
import { calendarToday, addDays, timezoneSchema } from "../lib/calendar.js";
import { scheduleTransaction, ScheduleConflict } from "../lib/schedule.js";
import { isId, newId } from "../db/ids.js";
import type { Conn } from "../db/client.js";
import { buildPlan, mealPlanRepo, type DayDoc, type MealDoc, type PlanDoc, type PlanInput } from "../repos/meal-plans.js";
import { pantryRepo, stockOperationRepo } from "../repos/pantry.js";
import { workoutPlanRepo } from "../repos/workouts.js";
import { userRepo } from "../repos/users.js";
import { foodHistoryRepo } from "../repos/food-history.js";
import { plannedDayRepo } from "../repos/planned-days.js";
import { mealPlanDays } from "../lib/planned-days.js";
import { targetsForUser } from "../lib/user-targets.js";

const router = Router();
router.use(requireAuth);

const generateSchema = z.object({
  days: z.number().int().min(1).max(7),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1).max(4).default(["breakfast", "lunch", "dinner"]),
  // 0 = cook strictly from the pantry, null = buy whatever the plan needs
  maxExtraItems: z.number().int().min(0).max(30).nullable().default(null),
});

const pantryFor = pantryStock;
const PREVIEW_SECRET = () => `${process.env.JWT_SECRET!}:meal-plan-preview`;

async function presentPlan(plan: PlanDoc, pantry: Awaited<ReturnType<typeof pantryFor>>) {
  const revision = `${plan.__v}:${await stockOperationRepo.count(plan.userId)}`;
  return { ...annotateReadiness(plan, pantry), shoppingList: shoppingRows(String(plan._id), revision, plan.days.flatMap((day) => day.meals), pantry) };
}
const respondWith = async (res: import("express").Response, plan: PlanDoc, userId: string) =>
  res.json(await presentPlan(plan, await pantryFor(userId)));

router.post("/", async (req: AuthRequest, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose 1–7 days and at least one meal." });

  // Checked before consuming usage so an impossible request doesn't cost a free plan
  if (parsed.data.maxExtraItems === 0 && !(await pantryRepo.exists(req.userId!))) {
    return res.status(400).json({ error: "Your pantry is empty. Add some groceries or allow a few extra ingredients.", code: "PANTRY_EMPTY" });
  }

  if (!(await consumeUsage(req.userId!, "plansThisMonth"))) {
    return res.status(402).json({ error: "You've used all your free meal plans this month. Upgrade to Plus for unlimited plans.", code: "LIMIT_REACHED" });
  }

  try {
    const user = (await userRepo.findById(req.userId!))!;
    const pantry = await readPantry(req.userId!);
    const now = Date.now();
    const prefs = user.preferences;

    const activeWorkout = await workoutPlanRepo.findActive(req.userId!);
    const trainingContext = activeWorkout ? { goal: user.training.goal, days: activeWorkout.days.map(d => ({ date: d.date, title: d.title, exercises: d.exercises.map(e => ({ exerciseId: e.exerciseId, sets: e.sets, durationSeconds: e.durationSeconds })) })) } : null;
    const targets = targetsForUser(user);
    const plan = await generatePlan({
      days: parsed.data.days,
      // Keep the requested meal order consistent (breakfast → snack)
      mealTypes: MEAL_TYPES.filter((t) => parsed.data.mealTypes.includes(t)),
      maxExtraItems: parsed.data.maxExtraItems,
      prefs: { diet: prefs.diet, allergies: prefs.allergies ?? [], goal: prefs.goal, budget: prefs.budget, heightCm: user.body.heightCm, weightKg: user.body.weightKg },
      trainingContext,
      dailyTargets: targets.ready ? targets : null,
      pantry: pantry.flatMap((ingredient) => ingredient.batches.map((batch) => ({
        name: ingredient.name, quantity: batch.quantity, unit: batch.unit,
        expiresInDays: batch.expiryDate ? Math.round((batch.expiryDate.getTime() - now) / 86_400_000) : null,
      }))),
    });

    // Build a preview in memory; only an accepted plan is persisted.
    const saved = buildPlan({
      userId: req.userId!,
      title: plan.title,
      days: plan.days,
      settingsSnapshot: { ...prefs, body: user.body, trainingContext, mealTypes: parsed.data.mealTypes, maxExtraItems: parsed.data.maxExtraItems },
    });
    const previewToken = jwt.sign({ plan: saved }, PREVIEW_SECRET(), { subject: req.userId!, audience: "meal-plan-preview", expiresIn: "1h" });
    res.json({ ...await presentPlan(saved, await pantryFor(req.userId!)), previewToken });
  } catch (err) {
    await refundUsage(req.userId!, "plansThisMonth");
    if (err instanceof AIError) return res.status(err.status).json({ error: err.message });
    console.error("plan generation failed", err);
    res.status(502).json({ error: "Couldn't create a meal plan. Please try again." });
  }
});

router.get("/", async (req: AuthRequest, res) => {
  const [plans, pantry] = await Promise.all([mealPlanRepo.listActive(req.userId!), pantryFor(req.userId!)]);
  res.json(
    plans.map((p) => {
      const { readyMeals, totalMeals } = annotateReadiness(p, pantry);
      const shopping = buildShoppingList(p.days.flatMap((d) => d.meals), pantry);
      return {
        _id: p._id,
        __v: p.__v,
        title: p.title,
        status: p.status,
        startDate: p.startDate,
        createdAt: p.createdAt,
        dayCount: p.days.length,
        shoppingTotal: shopping.length,
        maxExtraItems: p.settingsSnapshot.maxExtraItems,
        readyMeals,
        totalMeals,
      };
    })
  );
});

router.get("/:id", async (req: AuthRequest, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: "Plan not found" });
  const [plan, pantry] = await Promise.all([mealPlanRepo.findById(req.params.id, req.userId!), pantryFor(req.userId!)]);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json(await presentPlan(plan, pantry));
});

router.post("/:id/purchases/:itemId", async (req: AuthRequest, res) => {
  if (!isId(req.params.id) || !isId(req.params.itemId)) return res.status(400).json({ error: "Invalid purchase" });
  const found = await stockShoppingItem(req.userId!, req.params.id as string, req.params.itemId as string);
  if (!found) return res.status(404).json({ error: "Plan not found" });
  res.status(204).end();
});

const targetSchema = z.object({
  timezone: timezoneSchema,
  activeId: z.string().nullable(),
  revision: z.number().int().nullable(),
});
async function currentTarget(userId: string, target: z.infer<typeof targetSchema>, tx: Conn) {
  const active = await mealPlanRepo.findActive(userId, tx);
  if ((active ? active._id : null) !== target.activeId || (active?.__v ?? null) !== target.revision) throw new ScheduleConflict();
  return active;
}
function recipeKey(meal: MealDoc) {
  return JSON.stringify({ type: meal.type, title: meal.title, description: meal.description, prepMinutes: meal.prepMinutes,
    calories: meal.calories, nutrition: meal.nutrition, ingredients: meal.ingredients.map(({ name, quantity, unit, fromPantry }) => ({ name, quantity, unit, fromPantry })),
    steps: meal.steps, allergyWarnings: meal.allergyWarnings });
}
const orderedMeals = <T extends { type: typeof MEAL_TYPES[number] }>(meals: T[]) => meals.sort((a, b) => MEAL_TYPES.indexOf(a.type) - MEAL_TYPES.indexOf(b.type));
function freshMeals(meals: MealDoc[]): MealDoc[] {
  return meals.map((meal) => ({ ...meal, _id: newId(), eaten: false, historyEntryId: null }));
}

router.post("/replace", async (req: AuthRequest, res) => {
  const body = targetSchema.extend({ previewToken: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request" });
  let preview: jwt.JwtPayload;
  try {
    preview = jwt.verify(body.data.previewToken, PREVIEW_SECRET(), { audience: "meal-plan-preview", subject: req.userId!, algorithms: ["HS256"] }) as jwt.JwtPayload;
  } catch {
    return res.status(400).json({ error: "This preview has expired. Generate a new plan." });
  }
  const plan = await scheduleTransaction(req.userId!, async (tx) => {
    const draft = buildPlan({ ...(preview.plan as PlanInput), userId: req.userId! });
    const accepted = await mealPlanRepo.findById(draft._id, req.userId!, tx);
    if (accepted) return accepted;
    const active = await currentTarget(req.userId!, body.data, tx);
    const today = calendarToday(body.data.timezone);
    const entries = await foodHistoryRepo.list({ userId: req.userId!, date: today, reversed: false }, tx);
    const protectedMeals: MealDoc[] = entries.map((entry) => ({ ...entry.meal, _id: entry.mealId, eaten: true, historyEntryId: entry._id }));
    const types = new Set(protectedMeals.map((meal) => meal.type));
    draft.days.forEach((day) => {
      day.date = addDays(today, day.day - 1);
      const incoming = freshMeals(day.meals);
      day.meals = orderedMeals(day.day === 1 ? [...protectedMeals, ...incoming.filter((meal) => !types.has(meal.type))] : incoming);
    });
    const signature = (days: DayDoc[]) => JSON.stringify(days.map((day) => ({ date: day.date, meals: orderedMeals([...day.meals]).map(recipeKey) })));
        if (active && signature(active.days) === signature(draft.days)) throw new ScheduleConflict("That replacement would not change any meals.");
    if (active) {
      // Keep the finished days of the old plan so progress tracking still counts them
      await plannedDayRepo.recordPast(tx, req.userId!, "meal", mealPlanDays(active), today);
      await mealPlanRepo.delete(tx, active._id);
    }
    draft.status = "active";
    draft.startDate = today;
    return mealPlanRepo.insert(tx, draft);
  });
  await respondWith(res, plan, req.userId!);
});

router.post("/:id/meals/:mealId/eaten", async (req: AuthRequest, res) => {
  const body = z.object({ revision: z.number().int().nonnegative(), confirm: z.boolean().default(false), timezone: timezoneSchema }).safeParse(req.body);
  if (!body.success || !isId(req.params.id) || !isId(req.params.mealId)) return res.status(400).json({ error: "Invalid request" });
  const { id: planId, mealId } = req.params as { id: string; mealId: string };
  try {
    const plan = await scheduleTransaction(req.userId!, async (tx) => {
      const plan = await mealPlanRepo.findById(planId, req.userId!, tx);
      const day = plan?.status === "active" ? plan.days.find((day) => day.meals.some((meal) => meal._id === mealId)) : undefined;
      const meal = day?.meals.find((meal) => meal._id === mealId);
      if (!plan || !day || !meal) throw new ScheduleConflict("Meal no longer exists. Refresh your plan.", 404);
      if (meal.eaten) return plan;
      if (plan.__v !== body.data.revision) throw new ScheduleConflict();
      if (!day.date) throw new ScheduleConflict("This meal has no date. Refresh your plan.");
      if (day.date > calendarToday(body.data.timezone)) throw new ScheduleConflict("Future meals cannot be marked as eaten.");
      const consumed = await consumeIngredients(req.userId!, meal.ingredients.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit })), tx, body.data.confirm);
      const historyEntryId = newId();
      await foodHistoryRepo.create(tx, { _id: historyEntryId, userId: req.userId!, mealId: meal._id, sourcePlanId: plan._id, sourcePlanTitle: plan.title,
        date: day.date, recordedAt: new Date(), meal, consumed });
      await mealPlanRepo.setMealEaten(tx, plan._id, meal._id, true, historyEntryId);
      return (await mealPlanRepo.findById(plan._id, req.userId!, tx))!;
    });
    await respondWith(res, plan, req.userId!);
  } catch (error) {
    if (error instanceof PantryShortage) return res.status(409).json({ error: error.message, code: "SHORTAGE", shortages: error.shortages });
    throw error;
  }
});

export default router;
