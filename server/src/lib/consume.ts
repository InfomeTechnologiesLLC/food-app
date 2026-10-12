import type { Types } from "mongoose";
import { PantryItem, PANTRY_CATEGORIES } from "../models/PantryItem.js";
import { isStaple, sameIngredient } from "./ingredients.js";
import { convert } from "./units.js";

interface Ingredient { name: string; quantity: number; unit: string }

export interface Consumed {
  itemId: Types.ObjectId;
  name: string;
  amount: number;
  unit: string;
  category?: string | null;
  expiryDate?: Date | null;
  source?: string | null;
}

/** A recipe ingredient the pantry can't fully cover. */
export interface Shortage {
  name: string;
  needed: number;
  unit: string;
  /** Usable amount in the recipe's unit (0 when the item isn't in the pantry). */
  have: number;
  /** In the pantry, but in a unit we can't convert (e.g. pcs vs g), so it's left unchanged. */
  unitMismatch: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Works out what cooking these ingredients takes from the pantry. Matching items are used
 * soonest-expiring first; staples are skipped. Nothing is written.
 */
async function planDeduction(userId: string, ingredients: Ingredient[]) {
  const pantry = await PantryItem.find({ userId }).sort({ expiryDate: 1 }).lean();
  // Items without an expiry go last
  pantry.sort((a, b) => (a.expiryDate ? 0 : 1) - (b.expiryDate ? 0 : 1));
  const left = new Map(pantry.map((p) => [String(p._id), p.quantity ?? 0]));

  const deductions: Consumed[] = [];
  const shortages: Shortage[] = [];

  for (const ing of ingredients) {
    if (isStaple(ing.name)) continue;
    const matches = pantry.filter((p) => sameIngredient(p.name, ing.name));
    let needed = ing.quantity;
    let mismatched = matches.length > 0;

    for (const p of matches) {
      if (needed <= 0) break;
      const available = left.get(String(p._id))!;
      const availableInRecipeUnit = convert(available, p.unit ?? "", ing.unit);
      if (availableInRecipeUnit == null || available <= 0) continue;
      mismatched = false;
      const take = Math.min(needed, availableInRecipeUnit);
      const takeInPantryUnit = convert(take, ing.unit, p.unit ?? "")!;
      left.set(String(p._id), available - takeInPantryUnit);
      needed -= take;
      deductions.push({
        itemId: p._id,
        name: p.name,
        amount: takeInPantryUnit,
        unit: p.unit ?? "",
        category: p.category,
        expiryDate: p.expiryDate,
        source: p.source,
      });
    }

    if (needed > 1e-6) {
      shortages.push({ name: ing.name, needed: round(ing.quantity), unit: ing.unit, have: round(ing.quantity - needed), unitMismatch: mismatched });
    }
  }
  return { deductions, shortages, left };
}

export async function previewConsumption(userId: string, ingredients: Ingredient[]) {
  return (await planDeduction(userId, ingredients)).shortages;
}

/** Takes the ingredients out of the pantry. Items that reach zero are removed. */
export async function consumeIngredients(userId: string, ingredients: Ingredient[]) {
  const { deductions, left } = await planDeduction(userId, ingredients);
  const ids = [...new Set(deductions.map((d) => String(d.itemId)))];
  await Promise.all(
    ids.map((id) => {
      const remaining = left.get(id)!;
      return remaining <= 1e-6
        ? PantryItem.deleteOne({ _id: id, userId })
        : PantryItem.updateOne({ _id: id, userId }, { $set: { quantity: round(remaining) } });
    })
  );
  return deductions.map((d) => ({ ...d, amount: round(d.amount) }));
}

/** Puts back what consumeIngredients took, recreating items that were used up. */
export async function restoreIngredients(userId: string, consumed: Consumed[]) {
  for (const c of consumed) {
    const updated = await PantryItem.updateOne({ _id: c.itemId, userId }, { $inc: { quantity: c.amount } });
    if (!updated.matchedCount) {
      await PantryItem.create({
        _id: c.itemId,
        userId,
        name: c.name,
        quantity: c.amount,
        unit: c.unit,
        category: (c.category ?? undefined) as (typeof PANTRY_CATEGORIES)[number] | undefined,
        expiryDate: c.expiryDate ?? undefined,
        source: (c.source ?? undefined) as "groceries" | "receipt" | "manual" | undefined,
      });
    }
  }
}
