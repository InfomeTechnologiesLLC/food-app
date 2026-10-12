import { test } from "node:test";
import assert from "node:assert/strict";
import { sameIngredient, isAvailable, extraIngredients } from "../src/lib/ingredients.js";
import { annotateReadiness } from "../src/lib/readiness.js";
import { buildShoppingList } from "../src/lib/shopping.js";
import { consumeIngredients, previewConsumption } from "../src/lib/consume.js";
import { PantryItem } from "../src/models/PantryItem.js";

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
  const plan = { days: [{ day: 1, meals }], shoppingList: [] };
  assert.equal(annotateReadiness(plan, pantry).readyMeals, 0);
  assert.equal(annotateReadiness(plan, [flour]).readyMeals, 1);
});

test("cooking rice flour neither deducts nor deletes pantry rice", async (t) => {
  const rice = { _id: "rice-id", name: "rice", quantity: 100, unit: "g" };
  t.mock.method(PantryItem, "find", () => ({ sort: () => ({ lean: async () => [rice] }) }));
  const update = t.mock.method(PantryItem, "updateOne", async () => { throw new Error("Unexpected pantry update"); });
  const remove = t.mock.method(PantryItem, "deleteOne", async () => { throw new Error("Unexpected pantry deletion"); });
  const ingredients = [{ name: "rice flour", quantity: 100, unit: "g" }];
  assert.deepEqual(await previewConsumption("user-id", ingredients), [
    { name: "rice flour", needed: 100, unit: "g", have: 0, unitMismatch: false },
  ]);
  assert.deepEqual(await consumeIngredients("user-id", ingredients), []);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});
