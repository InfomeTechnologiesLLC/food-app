import mongoose from "mongoose";
import { StockOperation } from "../models/StockOperation.js";
import { MealPlan } from "../models/MealPlan.js";
import { addStockInSession, StockConflict } from "./add-stock.js";
import { pantryStock } from "./pantry.js";
import { shoppingRows } from "./shopping.js";

export async function stockShoppingItem(userId: string, planId: string, itemId: string) {
  return mongoose.connection.transaction(async (session) => {
    const key = `purchase:${planId}:${itemId}`;
    if (await StockOperation.exists({ userId, key }).session(session)) return true;
    const plan = await MealPlan.findOne({ _id: planId, userId }).session(session).lean();
    if (!plan) return false;
    const stock = await pantryStock(userId, session);
    const revision = `${plan.__v}:${await StockOperation.countDocuments({ userId }).session(session)}`;
    const item = shoppingRows(planId, revision, plan.days.flatMap((day) => day.meals), stock).find((item) => item._id === itemId);
    if (!item) throw new StockConflict("This shopping requirement changed. Refresh the plan before recording a purchase.");
    await addStockInSession(userId, key, [{ name: item.name, quantity: item.quantity, unit: item.unit, category: "other", expiryDate: null, source: "groceries" }], session);
    return true;
  });
}
