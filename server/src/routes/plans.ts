import { Router } from "express";
import { z } from "zod";
import mongoose, { isValidObjectId, type Types } from "mongoose";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { generatePlan, MEAL_TYPES } from "../ai/plan.js";
import { AIError } from "../ai/gemini.js";
import { stockShoppingItem } from "../lib/stock-shopping.js";
import { buildShoppingList, shoppingRows } from "../lib/shopping.js";
import { consumeIngredients, PantryShortage, restoreIngredients } from "../lib/consume.js";
import { annotateReadiness } from "../lib/readiness.js";
import { consumeUsage, refundUsage } from "../lib/usage.js";
import { MealPlan, type PlanData } from "../models/MealPlan.js";
import { PantryIngredient } from "../models/PantryIngredient.js";
import { pantryStock, readPantry } from "../lib/pantry.js";
import { StockOperation } from "../models/StockOperation.js";
import { User } from "../models/User.js";

const router = Router();
router.use(requireAuth);

const generateSchema = z.object({
  days: z.number().int().min(1).max(7),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1).max(4).default(["breakfast", "lunch", "dinner"]),
  // 0 = cook strictly from the pantry, null = buy whatever the plan needs
  maxExtraItems: z.number().int().min(0).max(30).nullable().default(null),
});

const pantryFor = pantryStock;

// The app sends its local midnight so day numbers line up with the user's calendar
const todaySchema = z.coerce.date().optional();
const DAY_MS = 86_400_000;

/** Which day of the plan `today` is (1 = start date). */
const dayIndex = (startDate: Date, today: Date) => Math.round((today.getTime() - startDate.getTime()) / DAY_MS) + 1;

const findPlan = (id: string, userId: string) =>
  isValidObjectId(id) ? MealPlan.findOne({ _id: id, userId }) : null;

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
      .limit(20)
      .select("title status startDate createdAt days.day days.meals.ingredients days.meals.made settingsSnapshot.maxExtraItems")
      .lean(),
    pantryFor(req.userId!),
  ]);
  res.json(
    plans.map((p) => {
      const { readyMeals, totalMeals } = annotateReadiness(p, pantry);
      const shopping = buildShoppingList(p.days.flatMap((d) => d.meals), pantry);
      return {
        _id: p._id,
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

/** Makes a draft the user's plan, replacing the current one if there is one. */
router.post("/:id/activate", async (req: AuthRequest, res) => {
  const today = todaySchema.safeParse(req.body?.today);
  if (!today.success) return res.status(400).json({ error: "Invalid request" });
  const plan = await findPlan(req.params.id as string, req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  if (plan.status === "active") return respondWith(res, plan, req.userId!);

  await MealPlan.deleteMany({ userId: req.userId, status: "active" });
  plan.status = "active";
  plan.startDate = today.data ?? new Date();
  await plan.save();
  respondWith(res, plan, req.userId!);
});

/** Adds the chosen days of a draft to the end of the current plan. */
router.post("/:id/merge", async (req: AuthRequest, res) => {
  const body = z.object({ days: z.array(z.number().int()).min(1), today: todaySchema }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Pick at least one day to add." });
  const draft = await findPlan(req.params.id as string, req.userId!);
  if (!draft || draft.status !== "draft") return res.status(404).json({ error: "Plan not found" });
  const active = await MealPlan.findOne({ userId: req.userId, status: "active" });
  if (!active) return res.status(409).json({ error: "You don't have a current plan to add to." });

  const picked = draft.days.filter((d) => body.data.days.includes(d.day!)).sort((a, b) => a.day! - b.day!);
  if (!picked.length) return res.status(400).json({ error: "Pick at least one day to add." });

  // New days go right after the plan's last day, or start today if the plan has already ended
  const lastDay = Math.max(0, ...active.days.map((d) => d.day!));
  const todayDay = dayIndex(active.startDate!, body.data.today ?? new Date());
  let next = Math.max(lastDay + 1, todayDay);
  for (const d of picked) {
    active.days.push({ day: next++, meals: d.toObject().meals.map((m: any) => ({ ...m, made: false, consumed: [] })) });
  }
  await active.save();
  respondWith(res, active, req.userId!);
});

/** Swaps one upcoming day of the current plan for a day from a draft. */
router.post("/:id/replace-day", async (req: AuthRequest, res) => {
  const body = z.object({ fromDay: z.number().int(), toDay: z.number().int(), today: todaySchema }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request" });
  const draft = await findPlan(req.params.id as string, req.userId!);
  if (!draft || draft.status !== "draft") return res.status(404).json({ error: "Plan not found" });
  const active = await MealPlan.findOne({ userId: req.userId, status: "active" });
  if (!active) return res.status(409).json({ error: "You don't have a current plan." });

  const from = draft.days.find((d) => d.day === body.data.fromDay);
  const to = active.days.find((d) => d.day === body.data.toDay);
  if (!from || !to) return res.status(404).json({ error: "Day not found" });
  if (body.data.toDay <= dayIndex(active.startDate!, body.data.today ?? new Date())) {
    return res.status(409).json({ error: "Only upcoming days can be replaced." });
  }
  if (to.meals.some((m) => m.made)) return res.status(409).json({ error: "That day has meals marked as made." });

  to.set("meals", from.toObject().meals.map((m: any) => ({ ...m, made: false, consumed: [] })));
  await active.save();
  respondWith(res, active, req.userId!);
});

/**
 * Marks a meal of the current plan as made (its ingredients come out of the pantry) or not made
 * (they go back). If the pantry is short, nothing changes until the app resends with confirm: true.
 */
router.post("/:id/meals/made", async (req: AuthRequest, res) => {
  const body = z.object({ day: z.number().int(), index: z.number().int().min(0), made: z.boolean(), confirm: z.boolean().default(false) }).safeParse(req.body);
  if (!body.success || !isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid request" });
  try {
    const plan = await mongoose.connection.transaction(async (session) => {
      const plan = await MealPlan.findOne({ _id: req.params.id, userId: req.userId, status: "active" }).session(session);
      const meal = plan?.days.find((d) => d.day === body.data.day)?.meals[body.data.index];
      if (!plan || !meal) return null;
      if (meal.made === body.data.made) return plan;
      const ingredients = meal.ingredients.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit }));
      if (body.data.made) {
        meal.set("consumed", await consumeIngredients(req.userId!, ingredients, session, body.data.confirm));
        meal.made = true;
        meal.madeAt = new Date();
      } else {
        await restoreIngredients(req.userId!, meal.consumed.map((item) => ({ ...item.toObject(), expiryDate: item.expiryDate ?? null })), session);
        meal.set("consumed", []);
        meal.made = false;
        meal.madeAt = undefined;
      }
      await plan.save({ session });
      return plan;
    });
    if (!plan) return res.status(404).json({ error: "Meal not found" });
    await respondWith(res, plan, req.userId!);
  } catch (error) {
    if (error instanceof PantryShortage) return res.status(409).json({ error: error.message, code: "SHORTAGE", shortages: error.shortages });
    throw error;
  }
});

router.delete("/:id", async (req: AuthRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: "Plan not found" });
  await MealPlan.deleteOne({ _id: req.params.id, userId: req.userId });
  res.status(204).end();
});

export default router;
