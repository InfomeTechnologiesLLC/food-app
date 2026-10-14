import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { MealPlan } from "../models/MealPlan.js";
import { FoodHistory } from "../models/FoodHistory.js";
import { PantryIngredient } from "../models/PantryIngredient.js";
import { StockOperation } from "../models/StockOperation.js";
import { addStockInSession } from "../lib/add-stock.js";
import { scheduleTransaction } from "../lib/schedule.js";
import { addDays, calendarToday, timezoneSchema } from "../lib/calendar.js";
import { readPantry, pantryStock } from "../lib/pantry.js";
import { annotateReadiness } from "../lib/readiness.js";
import { buildShoppingList } from "../lib/shopping.js";
import type { PantryCategory, StockInput } from "../domain/pantry.js";

if (process.env.NODE_ENV !== "development") throw new Error("Kerala fixtures require NODE_ENV=development.");
const option = (name: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const email = option("--user");
if (!email) throw new Error("Specify --user <account-email>. Existing accounts and preferences are preserved.");
const timezone = timezoneSchema.parse(option("--timezone") ?? "Asia/Kolkata");
const today = calendarToday(timezone);
const startDate = addDays(today, -1);
const key = `seed:kerala:${today}`;

const ingredient = (name: string, quantity: number, unit = "g") => ({ name, quantity, unit, fromPantry: name !== "coconut milk" && name !== "beetroot" });
type MealType = "breakfast" | "lunch" | "dinner";
function meal(type: MealType, title: string, description: string, prepMinutes: number, calories: number,
  proteinGrams: number, carbsGrams: number, fatGrams: number, ingredients: ReturnType<typeof ingredient>[], steps: string[]) {
  return { type, title, description, prepMinutes, calories, nutrition: { proteinGrams, carbsGrams, fatGrams }, ingredients, steps, allergyWarnings: [] };
}
const i = ingredient;
const puttu = meal("breakfast", "Puttu & kadala curry", "Steamed rice-flour puttu with grated coconut and a chickpea curry. Mock nutrition estimates for one serving.", 35, 590, 19, 90, 17,
  [i("rice flour", 75), i("coconut", 25), i("chickpea", 60), i("onion", 40), i("tomato", 50), i("coconut oil", 5, "ml"), i("curry leaf", 2)],
  ["Soak the chickpeas overnight, then pressure-cook until tender.", "Moisten rice flour with salted water until crumbly; layer with coconut and steam in a puttu maker.", "Sauté onion, tomato and curry leaves in coconut oil with turmeric and chilli.", "Add cooked chickpeas and simmer; serve beside the puttu."]);
const thoran = meal("lunch", "Matta rice, cabbage thoran & parippu", "Kerala red rice with coconut cabbage and a comforting lentil curry.", 35, 560, 19, 88, 15,
  [i("red rice", 75), i("cabbage", 120), i("coconut", 25), i("moong dal", 40), i("coconut oil", 5, "ml"), i("green chili", 5), i("curry leaf", 2)],
  ["Cook the red rice in plenty of water until tender and drain.", "Cook moong dal with turmeric until soft; season with salt.", "Stir-fry shredded cabbage with coconut, green chilli and curry leaves until just tender.", "Temper mustard seeds in coconut oil and spoon over the dal; serve all three together."]);
const dosa = meal("dinner", "Dosa & vegetable sambar", "Crisp homemade dosa with lentil and vegetable sambar.", 35, 480, 18, 78, 11,
  [i("white rice", 60), i("urad dal", 20), i("toor dal", 35), i("carrot", 50), i("tomato", 50), i("onion", 30), i("tamarind", 5), i("coconut oil", 5, "ml")],
  ["Soak rice and urad dal separately, grind, mix and ferment overnight.", "Cook toor dal until soft; simmer carrot, tomato and onion in tamarind water.", "Combine dal and vegetables with sambar spices and season.", "Spread batter thinly on a hot pan, drizzle a little oil and cook; serve with sambar."]);
const appam = meal("breakfast", "Appam & vegetable stew", "Soft appam with a gentle coconut-milk vegetable stew. Coconut milk is intentionally missing from the mock pantry.", 30, 520, 11, 80, 17,
  [i("white rice", 65), i("coconut", 20), i("potato", 100), i("carrot", 50), i("green bean", 40), i("onion", 30), i("coconut milk", 150, "ml"), i("ginger", 5)],
  ["Soak rice, grind with coconut and a little cooked rice, then ferment overnight.", "Cook potato, carrot and beans with sliced onion and ginger until tender.", "Add coconut milk and warm gently; season with salt and pepper.", "Swirl appam batter in an appam pan, cover and cook until the centre sets; serve with stew."]);
const avial = meal("lunch", "Matta rice & avial", "Red rice with mixed vegetables, coconut, curry leaves and yogurt.", 30, 540, 15, 83, 17,
  [i("red rice", 75), i("carrot", 60), i("green bean", 60), i("potato", 80), i("coconut", 30), i("yogurt", 80), i("green chili", 5), i("coconut oil", 5, "ml"), i("curry leaf", 2)],
  ["Cook the red rice until tender.", "Cut vegetables into batons and cook with turmeric and a little water.", "Coarsely grind coconut with green chilli and stir into the vegetables.", "Turn the heat down and fold in yogurt; finish with curry leaves and coconut oil, then serve with rice."]);
const idiyappam = meal("dinner", "Idiyappam & cherupayar curry", "Steamed rice noodles with a simple green-gram curry.", 30, 510, 18, 85, 11,
  [i("rice flour", 75), i("green gram", 55), i("coconut", 20), i("onion", 35), i("tomato", 40), i("coconut oil", 5, "ml"), i("curry leaf", 2)],
  ["Soak the green gram, then cook until tender.", "Mix rice flour with hot salted water, knead and press into noodle nests; steam until cooked.", "Sauté onion, tomato and curry leaves; add spices and cooked green gram.", "Stir in ground coconut, simmer briefly and serve with idiyappam."]);
const idli = meal("breakfast", "Idli & sambar", "Steamed fermented rice-and-lentil cakes with vegetable sambar.", 30, 440, 17, 77, 7,
  [i("white rice", 60), i("urad dal", 25), i("toor dal", 30), i("carrot", 40), i("tomato", 40), i("tamarind", 5), i("curry leaf", 2)],
  ["Soak rice and urad dal separately, grind and ferment the combined batter overnight.", "Steam batter in greased idli moulds until set.", "Cook toor dal and simmer vegetables in tamarind water with sambar spices.", "Combine, temper with mustard seeds and curry leaves, and serve with the idli."]);
const upma = meal("lunch", "Vegetable rava upma", "Roasted semolina with vegetables, ginger and curry leaves.", 20, 430, 12, 68, 12,
  [i("semolina", 80), i("carrot", 50), i("green bean", 40), i("onion", 35), i("ginger", 5), i("coconut oil", 7, "ml"), i("curry leaf", 2)],
  ["Dry-roast semolina until fragrant and set aside.", "Temper mustard seeds in coconut oil; sauté onion, ginger, curry leaves and vegetables.", "Add water and salt and bring to a simmer.", "Stir in semolina gradually; cover and cook until fluffy."]);
const kanji = meal("dinner", "Cherupayar kanji & coconut chammanthi", "A light red-rice and green-gram porridge with coconut chutney.", 35, 460, 16, 76, 11,
  [i("red rice", 60), i("green gram", 45), i("coconut", 25), i("shallot", 15), i("green chili", 5), i("ginger", 3)],
  ["Rinse rice and soaked green gram and cook with extra water until soft.", "Season the porridge with salt and adjust its consistency with hot water.", "Grind coconut, shallot, green chilli and ginger into a coarse chammanthi.", "Serve the warm kanji with the chutney on the side."]);
const stock = (name: string, quantity: number, unit: string, category: PantryCategory, days?: number): StockInput => ({
  name, quantity, unit, category, source: "manual", expiryDate: days === undefined ? null : new Date(`${addDays(today, days)}T00:00:00Z`),
});
const pantry = [
  stock("red rice", 1500, "g", "grains"), stock("white rice", 1200, "g", "grains"), stock("rice flour", 800, "g", "grains"),
  stock("chickpea", 400, "g", "grains"), stock("green gram", 500, "g", "grains"), stock("moong dal", 400, "g", "grains"),
  stock("toor dal", 400, "g", "grains"), stock("urad dal", 350, "g", "grains"), stock("semolina", 500, "g", "grains"),
  stock("coconut", 150, "g", "produce", 2), stock("coconut", 350, "g", "produce", 7),
  stock("onion", 700, "g", "produce", 12), stock("shallot", 250, "g", "produce", 12), stock("tomato", 600, "g", "produce", 3),
  stock("carrot", 600, "g", "produce", 8), stock("green bean", 350, "g", "produce", 4), stock("cabbage", 500, "g", "produce", 6),
  stock("potato", 700, "g", "produce", 14), stock("banana", 6, "pcs", "produce", 2), stock("yogurt", 400, "g", "dairy", 4),
  stock("curry leaf", 30, "g", "produce", 3), stock("green chili", 60, "g", "produce", 6), stock("ginger", 100, "g", "produce", 12),
  stock("tamarind", 100, "g", "spices"), stock("coconut oil", 250, "ml", "spices"), stock("mustard seed", 80, "g", "spices"),
  stock("turmeric", 50, "g", "spices"), stock("salt", 500, "g", "spices"), stock("black pepper", 50, "g", "spices"), stock("sambar powder", 100, "g", "spices"),
];

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new Error("Account not found. Create your account in the app first.");
  if (user.preferences?.diet === "vegan") throw new Error("These vegetarian fixtures include yogurt; use a vegetarian test account.");
  const result = await scheduleTransaction(user.id, async (session) => {
    if (await StockOperation.exists({ userId: user._id, key }).session(session)) return "already seeded";
    for (const collection of [MealPlan, FoodHistory, PantryIngredient, StockOperation]) {
      if (await collection.collection.countDocuments({ userId: user._id }, { session })) throw new Error("This account already has domain data. Seed only a freshly reset test account.");
    }
    await addStockInSession(user.id, key, pantry, session);
    const settingsSnapshot = { ...user.toObject().preferences!, body: user.toObject().body, mealTypes: ["breakfast", "lunch", "dinner"], maxExtraItems: 5 };
    await MealPlan.create([{
      userId: user._id, title: "Kerala home kitchen · 3-day mock plan", status: "active", startDate, settingsSnapshot,
      days: [[puttu, thoran, dosa], [appam, avial, idiyappam], [idli, upma, kanji]].map((meals, index) => ({ day: index + 1, date: addDays(startDate, index), meals })),
    }], { session, ordered: true });
    return "seeded";
  });
  const active = await MealPlan.findOne({ userId: user._id, status: "active" }).lean();
  const stock = await pantryStock(user.id);
  const ready = active ? annotateReadiness(active, stock) : null;
  console.log(JSON.stringify({ result, email: user.email, timezone, startDate: active?.startDate,
    pantryItems: (await readPantry(user.id)).length, pantryBatches: (await readPantry(user.id)).reduce((count, item) => count + item.batches.length, 0),
    activeMeals: ready?.totalMeals, readyMeals: ready?.readyMeals, shopping: active ? buildShoppingList(active.days.flatMap((day) => day.meals), stock) : [],
    historyEntries: await FoodHistory.countDocuments({ userId: user._id }),
    usage: (await User.findById(user._id).lean())?.usage,
  }, null, 2));
} finally { await mongoose.disconnect(); }
