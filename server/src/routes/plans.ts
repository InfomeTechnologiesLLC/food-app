import { Router } from "express";
import { z } from "zod";
import mongoose, { isValidObjectId, type Types } from "mongoose";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { generatePlan, MEAL_TYPES } from "../ai/plan.js";
import { AIError } from "../ai/gemini.js";
import { stockShoppingItem } from "../lib/stock-shopping.js";
import { buildShoppingList, shoppingRows } from "../lib/shopping.js";
import { consumeIngredients, PantryShortage } from "../lib/consume.js";
import { annotateReadiness } from "../lib/readiness.js";
import { consumeUsage, refundUsage } from "../lib/usage.js";
import { MealPlan, type PlanData, mealSchema } from "../models/MealPlan.js";
import { PantryIngredient } from "../models/PantryIngredient.js";
import { pantryStock, readPantry } from "../lib/pantry.js";
import { StockOperation } from "../models/StockOperation.js";
import { User } from "../models/User.js";

import { calendarToday, addDays, timezoneSchema } from "../lib/calendar.js";
import { scheduleTransaction, ScheduleConflict } from "../lib/schedule.js";
import { FoodHistory } from "../models/FoodHistory.js";

const router = Router();
router.use(requireAuth);

const generateSchema = z.object({
  days: z.number().int().min(1).max(7),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1).max(4).default(["breakfast", "lunch", "dinner"]),
  // 0 = cook strictly from the pantry, null = buy whatever the plan needs
  maxExtraItems: z.number().int().min(0).max(30).nullable().default(null),
});

const pantryFor = pantryStock;

type PlanDoc = NonNullable<Awaited<ReturnType<typeof MealPlan.findOne>>>;

async function presentPlan(plan: PlanData & { _id: Types.ObjectId; __v: number }, pantry: Awaited<ReturnType<typeof pantryFor>>) {
  const revision = `${plan.__v}:${await StockOperation.countDocuments({ userId: plan.userId })}`;
  return { ...annotateReadiness(plan, pantry), shoppingList: shoppingRows(String(plan._id), revision, plan.days.flatMap((day) => day.meals), pantry) };
}
const respondWith = async (res: import("express").Response, plan: PlanDoc, userId: string) =>
  res.json(await presentPlan(plan.toObject(), await pantryFor(userId)));

router.post("/", async (req: AuthRequest, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose 1–7 days and at least one meal." });

  // Checked before consuming usage so an impossible request doesn't cost a free plan
  if (parsed.data.maxExtraItems === 0 && !(await PantryIngredient.exists({ userId: req.userId }))) {
    return res.status(400).json({ error: "Your pantry is empty. Add some groceries or allow a few extra ingredients.", code: "PANTRY_EMPTY" });
  }

  if (!(await consumeUsage(req.userId!, "plansThisMonth"))) {
    return res.status(402).json({ error: "You've used all your free meal plans this month. Upgrade to Plus for unlimited plans.", code: "LIMIT_REACHED" });
  }

  try {
    const user = await User.findById(req.userId).lean();
    const pantry = await readPantry(req.userId!);
    const now = Date.now();
    const prefs = user!.preferences!;

    const plan = await generatePlan({
      days: parsed.data.days,
      // Keep the requested meal order consistent (breakfast → snack)
      mealTypes: MEAL_TYPES.filter((t) => parsed.data.mealTypes.includes(t)),
      maxExtraItems: parsed.data.maxExtraItems,
      prefs: { diet: prefs.diet!, allergies: prefs.allergies ?? [], goal: prefs.goal!, budget: prefs.budget!, heightCm: prefs.heightCm, weightKg: prefs.weightKg },
      pantry: pantry.flatMap((ingredient) => ingredient.batches.map((batch) => ({
        name: ingredient.name, quantity: batch.quantity, unit: batch.unit,
        expiresInDays: batch.expiryDate ? Math.round((batch.expiryDate.getTime() - now) / 86_400_000) : null,
      }))),
    });

    // Saved as a draft: the user decides whether and how it goes into their plan
    const saved = await MealPlan.create({
      userId: req.userId,
      title: plan.title,
      status: "draft",
      days: plan.days,
      settingsSnapshot: { ...prefs, mealTypes: parsed.data.mealTypes, maxExtraItems: parsed.data.maxExtraItems },
    });
    res.status(201).json(await presentPlan(saved.toObject(), await pantryFor(req.userId!)));
  } catch (err) {
    await refundUsage(req.userId!, "plansThisMonth");
    if (err instanceof AIError) return res.status(err.status).json({ error: err.message });
    console.error("plan generation failed", err);
    res.status(502).json({ error: "Couldn't create a meal plan. Please try again." });
  }
});

router.get("/", async (req: AuthRequest, res) => {
  const [plans, pantry] = await Promise.all([
    MealPlan.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .select("__v title status startDate createdAt days.day days.meals.ingredients days.meals.eaten settingsSnapshot.maxExtraItems")
      .lean(),
    pantryFor(req.userId!),
  ]);
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
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "Plan not found" });
  const [plan, pantry] = await Promise.all([
    MealPlan.findOne({ _id: req.params.id, userId: req.userId }),
    pantryFor(req.userId!),
  ]);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  res.json(await presentPlan(plan.toObject(), pantry));
});

router.post("/:id/purchases/:itemId", async (req: AuthRequest, res) => {
  if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.itemId)) return res.status(400).json({ error: "Invalid purchase" });
  const found = await stockShoppingItem(req.userId!, req.params.id as string, req.params.itemId as string);
  if (!found) return res.status(404).json({ error: "Plan not found" });
  res.status(204).end();
});

const targetSchema = z.object({
  timezone: timezoneSchema,
  activeId: z.string().nullable(),
  revision: z.number().int().nullable(),
});
async function currentTarget(userId: string, target: z.infer<typeof targetSchema>, session: mongoose.ClientSession) {
  const active = await MealPlan.findOne({ userId, status: "active" }).session(session);
  if ((active ? String(active._id) : null) !== target.activeId || (active?.__v ?? null) !== target.revision) throw new ScheduleConflict();
  return active;
}
type MealObject = mongoose.InferSchemaType<typeof mealSchema>;
function recipeKey(meal: MealObject) {
  return JSON.stringify({ type: meal.type, title: meal.title, description: meal.description, prepMinutes: meal.prepMinutes,
    calories: meal.calories, nutrition: meal.nutrition, ingredients: meal.ingredients.map(({ name, quantity, unit, fromPantry }) => ({ name, quantity, unit, fromPantry })),
    steps: meal.steps, allergyWarnings: meal.allergyWarnings });
}
const orderedMeals = <T extends { type: typeof MEAL_TYPES[number] }>(meals: T[]) => meals.sort((a, b) => MEAL_TYPES.indexOf(a.type) - MEAL_TYPES.indexOf(b.type));
function freshMeals(meals: PlanDoc["days"][number]["meals"]) {
  return meals.map((meal) => ({ ...meal.toObject(), _id: new mongoose.Types.ObjectId(), eaten: false, historyEntryId: null }));
}

router.post("/:id/activate", async (req: AuthRequest, res) => {
  const body = targetSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request" });
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "Plan not found" });
  const plan = await scheduleTransaction(req.userId!, async (session) => {
    const draft = await MealPlan.findOne({ _id: req.params.id, userId: req.userId }).session(session);
    if (!draft) throw new ScheduleConflict("Plan not found", 404);
    if (draft.status === "active") return draft;
    const active = await currentTarget(req.userId!, body.data, session);
    const today = calendarToday(body.data.timezone);
    const entries = await FoodHistory.find({ userId: req.userId, date: today, reversed: false }).session(session).lean();
    const protectedMeals = entries.map((entry) => ({ ...entry.meal!, _id: entry.mealId, eaten: true, historyEntryId: entry._id }));
    const types = new Set(protectedMeals.map((meal) => meal.type));
    draft.days.forEach((day) => {
      day.date = addDays(today, day.day - 1);
      const incoming = freshMeals(day.meals);
      day.set("meals", orderedMeals(day.day === 1 ? [...protectedMeals, ...incoming.filter((meal) => !types.has(meal.type))] : incoming));
    });
    const signature = (days: PlanDoc["days"]) => JSON.stringify(days.map((day) => ({ date: day.date, meals: orderedMeals(day.meals.map((meal) => meal.toObject())).map(recipeKey) })));
    if (active && signature(active.days) === signature(draft.days)) throw new ScheduleConflict("That replacement would not change any meals.");
    if (active) await active.deleteOne({ session });
    draft.status = "active";
    draft.startDate = today;
    await draft.save({ session });
    return draft;
  });
  await respondWith(res, plan, req.userId!);
});

router.post("/:id/merge", async (req: AuthRequest, res) => {
  const body = targetSchema.extend({ days: z.array(z.number().int().positive()).min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Pick at least one day to add." });
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "Plan not found" });
  const active = await scheduleTransaction(req.userId!, async (session) => {
    const draft = await MealPlan.findOne({ _id: req.params.id, userId: req.userId, status: "draft" }).session(session);
    if (!draft) throw new ScheduleConflict("Draft not found", 404);
    const active = await currentTarget(req.userId!, body.data, session);
    if (!active) throw new ScheduleConflict("You don't have a current plan.");
    const picked = draft.days.filter((day) => body.data.days.includes(day.day)).sort((a, b) => a.day - b.day);
    if (picked.length !== new Set(body.data.days).size) throw new ScheduleConflict("Day not found", 404);
    const last = active.days.reduce((a, b) => a.day > b.day ? a : b);
    const today = calendarToday(body.data.timezone);
    let date = addDays(last.date!, 1);
    if (date < today) date = today;
    let next = Math.round((new Date(date).getTime() - new Date(active.startDate!).getTime()) / 86400000) + 1;
    for (const day of picked) {
      active.days.push({ day: next++, date, meals: freshMeals(day.meals) });
      date = addDays(date, 1);
    }
    await active.save({ session });
    return active;
  });
  await respondWith(res, active, req.userId!);
});

router.post("/:id/replace-day", async (req: AuthRequest, res) => {
  const body = targetSchema.extend({ fromDay: z.number().int(), toDay: z.number().int() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request" });
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "Plan not found" });
  const active = await scheduleTransaction(req.userId!, async (session) => {
    const draft = await MealPlan.findOne({ _id: req.params.id, userId: req.userId, status: "draft" }).session(session);
    if (!draft) throw new ScheduleConflict("Draft not found", 404);
    const active = await currentTarget(req.userId!, body.data, session);
    if (!active) throw new ScheduleConflict("You don't have a current plan.");
    const from = draft.days.find((day) => day.day === body.data.fromDay);
    const to = active.days.find((day) => day.day === body.data.toDay);
    if (!from || !to) throw new ScheduleConflict("Day not found", 404);
    if (to.date! < calendarToday(body.data.timezone)) throw new ScheduleConflict("Past days cannot be replaced.");
    const kept = to.meals.filter((meal) => meal.eaten);
    const types = new Set(kept.map((meal) => meal.type));
    const incoming = freshMeals(from.meals).filter((meal) => !types.has(meal.type));
    const next = orderedMeals([...kept.map((meal) => meal.toObject()), ...incoming]);
    if (JSON.stringify(orderedMeals(to.meals.map((meal) => meal.toObject())).map(recipeKey)) === JSON.stringify(next.map(recipeKey))) throw new ScheduleConflict("That replacement would not change any meals.");
    to.set("meals", next);
    await active.save({ session });
    return active;
  });
  await respondWith(res, active, req.userId!);
});

router.post("/:id/meals/:mealId/eaten", async (req: AuthRequest, res) => {
  const body = z.object({ revision: z.number().int().nonnegative(), confirm: z.boolean().default(false), timezone: timezoneSchema }).safeParse(req.body);
  if (!body.success || !isValidObjectId(req.params.id) || !isValidObjectId(req.params.mealId)) return res.status(400).json({ error: "Invalid request" });
  try {
    const plan = await scheduleTransaction(req.userId!, async (session) => {
      const plan = await MealPlan.findOne({ _id: req.params.id, userId: req.userId, status: "active" }).session(session);
      const day = plan?.days.find((day) => day.meals.some((meal) => String(meal._id) === req.params.mealId));
      const meal = day?.meals.find((meal) => String(meal._id) === req.params.mealId);
      if (!plan || !day || !meal) throw new ScheduleConflict("Meal no longer exists. Refresh your plan.", 404);
      if (meal.eaten) return plan;
      if (plan.__v !== body.data.revision) throw new ScheduleConflict();
      {
        if (day.date! > calendarToday(body.data.timezone)) throw new ScheduleConflict("Future meals cannot be marked as eaten.");
        const consumed = await consumeIngredients(req.userId!, meal.ingredients.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit })), session, body.data.confirm);
        meal.eaten = true;
        meal.historyEntryId = new mongoose.Types.ObjectId();
        await FoodHistory.create([{ _id: meal.historyEntryId, userId: req.userId!, mealId: meal._id, sourcePlanId: plan._id, sourcePlanTitle: plan.title,
          date: day.date!, recordedAt: new Date(), meal: meal.toObject(), consumed }], { session });
        await plan.save({ session });
      }
      return plan;
    });
    await respondWith(res, plan, req.userId!);
  } catch (error) {
    if (error instanceof PantryShortage) return res.status(409).json({ error: error.message, code: "SHORTAGE", shortages: error.shortages });
    throw error;
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "Plan not found" });
  await scheduleTransaction(req.userId!, async (session) => {
    await MealPlan.deleteOne({ _id: req.params.id, userId: req.userId }, { session });
  });
  res.status(204).end();
});

export default router;
