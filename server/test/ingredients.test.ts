import { test } from "node:test";
import assert from "node:assert/strict";
import { sameIngredient, isAvailable, extraIngredients, findAllergens } from "../src/lib/ingredients.js";
import { annotateReadiness } from "../src/lib/readiness.js";
import { buildShoppingList } from "../src/lib/shopping.js";
import { planConsumption } from "../src/lib/consume.js";
import { Types } from "mongoose";

test("plant milk exceptions preserve tree nut and soy warnings", () => {
  const allergies = ["milk", "tree nuts", "soy"];
  assert.deepEqual(findAllergens("Almond milk", allergies), ["tree nuts"]);
  assert.deepEqual(findAllergens("SOY-MILK", allergies), ["soy"]);
  assert.deepEqual(findAllergens("Smoothie | almond milk | soy milk", allergies), ["tree nuts", "soy"]);
  assert.deepEqual(findAllergens("almond milk | cow milk", allergies), ["milk", "tree nuts"]);
});

test("allergy-specific exceptions still suppress misleading ingredient names", () => {
  assert.deepEqual(findAllergens("oat milk | rice milk | coconut milk | cream of tartar | eggplant | buckwheat | peanut free", ["milk", "eggs", "gluten", "peanuts"]), []);
  assert.deepEqual(findAllergens("peanut free | peanut butter", ["peanuts"]), ["peanuts"]);
});

test("related but distinct foods do not match in either direction", () => {
  for (const [a, b] of [["rice", "rice flour"], ["milk", "coconut milk"], ["peanut", "peanut butter"], ["chicken", "chicken breast"]]) {
    assert.equal(sameIngredient(a!, b!), false);
    assert.equal(sameIngredient(b!, a!), false);
  }
});

test("case, spacing, punctuation and ordinary plurals still match", () => {
  assert.equal(sameIngredient("  TOMATOES ", "tomato"), true);
  assert.equal(sameIngredient("Green-onions", "green onion"), true);
  assert.equal(sameIngredient("RICE", "rice"), true);
  for (const name of ["", "   ", "!!!"]) {
    assert.equal(sameIngredient(name, name), false);
    assert.equal(sameIngredient(name, "rice"), false);
  }
});

test("rice cannot make rice flour available or remove it from shopping", () => {
  const flour = { name: "rice flour", quantity: 100, unit: "g" };
  const meals = [{ ingredients: [flour] }];
  const pantry = [{ name: "rice", quantity: 500, unit: "g" }];
  assert.equal(isAvailable(flour.name, ["rice"]), false);
  assert.deepEqual(extraIngredients(meals, ["rice"]), ["rice flour"]);
  assert.deepEqual(buildShoppingList(meals, pantry), [flour]);
  const plan = { days: [{ day: 1, meals }] };
  assert.equal(annotateReadiness(plan, pantry).readyMeals, 0);
  assert.equal(annotateReadiness(plan, [flour]).readyMeals, 1);
});

test("cooking rice flour neither deducts nor deletes pantry rice", () => {
  const rice = { _id: new Types.ObjectId(), userId: new Types.ObjectId(), key: "rice", name: "rice", category: "grains" as const,
    batches: [{ _id: new Types.ObjectId(), quantity: 100, unit: "g", expiryDate: null, source: "manual" as const }] };
  const plan = planConsumption([rice], [{ name: "rice flour", quantity: 100, unit: "g" }]);
  assert.deepEqual(plan.shortages, [{ name: "rice flour", quantity: 100, unit: "g", have: 0, shortage: 100, unitMismatch: false, incompatibleStock: [] }]);
  assert.deepEqual(plan.deductions, []);
  assert.deepEqual(plan.remaining, [rice]);
});
