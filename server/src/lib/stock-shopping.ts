import { scheduleTransaction } from "./schedule.js";
import { stockOperationRepo } from "../repos/pantry.js";
import { mealPlanRepo } from "../repos/meal-plans.js";
import { addStockInSession, StockConflict } from "./add-stock.js";
import { pantryStock } from "./pantry.js";
import { shoppingRows } from "./shopping.js";

export async function stockShoppingItem(userId: string, planId: string, itemId: string) {
  return scheduleTransaction(userId, async (tx) => {
    const key = `purchase:${planId}:${itemId}`;
    if (await stockOperationRepo.exists(userId, key, tx)) return true;
    const plan = await mealPlanRepo.findById(planId, userId, tx);
    if (!plan) return false;
    const stock = await pantryStock(userId, tx);
    const revision = `${plan.__v}:${await stockOperationRepo.count(userId, tx)}`;
    const item = shoppingRows(planId, revision, plan.days.flatMap((day) => day.meals), stock).find((item) => item._id === itemId);
    if (!item) throw new StockConflict("This shopping requirement changed. Refresh the plan before recording a purchase.");
    await addStockInSession(userId, key, [{ name: item.name, quantity: item.quantity, unit: item.unit, category: "other", expiryDate: null, source: "groceries" }], tx);
    return true;
  });
}
