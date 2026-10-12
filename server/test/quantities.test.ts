import { test } from "node:test";
import assert from "node:assert/strict";
import { annotateReadiness } from "../src/lib/readiness.js";
import { buildShoppingList } from "../src/lib/shopping.js";

const item = (name: string, quantity: number, unit = "g") => ({ name, quantity, unit });
const meal = (...ingredients: ReturnType<typeof item>[]) => ({ ingredients });
const readiness = (ingredients: ReturnType<typeof item>[], pantry: ReturnType<typeof item>[], shoppingList: (ReturnType<typeof item> & { checked: boolean })[] = []) =>
  annotateReadiness({ days: [{ day: 1, meals: [meal(...ingredients)] }], shoppingList }, pantry);

test("50 g rice cannot cover 200 g; shopping includes only 150 g", () => {
  const rice = item("rice", 200);
  const pantry = [item("rice", 50)];
  assert.equal(readiness([rice], pantry).readyMeals, 0);
  assert.deepEqual(buildShoppingList([meal(rice)], pantry), [item("rice", 150)]);
});
test("converts units and combines duplicate pantry entries without mutation", () => {
  const pantry = [item("rice", 0.1, "kg"), item("rice", 100)];
  assert.equal(readiness([item("rice", 200)], pantry).readyMeals, 1);
  assert.deepEqual(buildShoppingList([meal(item("rice", 250))], pantry), [item("rice", 50)]);
  assert.equal(pantry[0]!.quantity, 0.1);
});
test("incompatible units cannot imply sufficient stock", () => {
  const eggs = item("eggs", 200);
  assert.equal(readiness([eggs], [item("egg", 2, "pcs")]).readyMeals, 0);
  assert.deepEqual(buildShoppingList([meal(eggs)], [item("egg", 2, "pcs")]), [eggs]);
});
test("pantry stock is spent once across the plan; made meals are excluded", () => {
  const meals = [meal(item("rice", 200)), meal(item("rice", 200)), { ...meal(item("rice", 500)), made: true }];
  assert.deepEqual(buildShoppingList(meals, [item("rice", 250)]), [item("rice", 150)]);
});
test("duplicate ingredients within a meal cannot reuse stock", () => {
  const result = readiness([item("rice", 150), item("rice", 150)], [item("rice", 200)]);
  assert.equal(result.readyMeals, 0);
  assert.deepEqual(result.days[0]!.meals[0]!.ingredients.map((i) => i.available), [true, false]);
});
test("checked shopping quantities top up stock, unchecked ones do not", () => {
  const rice = item("rice", 200);
  assert.equal(readiness([rice], [item("rice", 50)], [{ ...item("rice", 150), checked: true }]).readyMeals, 1);
  assert.equal(readiness([rice], [], [{ ...item("rice", 150), checked: true }]).readyMeals, 0);
  assert.equal(readiness([rice], [item("rice", 50)], [{ ...item("rice", 150), checked: false }]).readyMeals, 0);
});
test("each meal can be cooked independently from current stock", () => {
  const result = annotateReadiness({ days: [{ day: 1, meals: [meal(item("rice", 200)), meal(item("rice", 200))] }], shoppingList: [] }, [item("rice", 200)]);
  assert.equal(result.readyMeals, 2);
});
test("compatible shortage units merge; staples remain assumed available", () => {
  assert.deepEqual(buildShoppingList([meal(item("rice", 100), item("rice", 0.2, "kg"), item("salt", 10))], []), [item("rice", 300)]);
  assert.equal(readiness([item("salt", 10)], []).readyMeals, 1);
});
test("zero stock and fractional shortages do not disappear", () => {
  assert.equal(readiness([item("rice", 1)], [item("rice", 0)]).readyMeals, 0);
  assert.deepEqual(buildShoppingList([meal(item("rice", 1))], [item("rice", 0.999)]), [item("rice", 0.01)]);
});
