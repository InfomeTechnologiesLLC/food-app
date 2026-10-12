import { test } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import { PantryItem } from "../src/models/PantryItem.js";
import { stockShoppingItem } from "../src/lib/stock-shopping.js";
import { annotateReadiness } from "../src/lib/readiness.js";
import { previewConsumption, consumeIngredients } from "../src/lib/consume.js";
import { buildShoppingList } from "../src/lib/shopping.js";

test("a checked shopping row alone cannot make a meal ready", () => {
  const rice = { name: "rice", quantity: 100, unit: "g" };
  const plan = { days: [{ day: 1, meals: [{ ingredients: [rice] }] }], shoppingList: [{ ...rice, checked: true }] };
  assert.equal(annotateReadiness(plan, []).readyMeals, 0);
  assert.equal(annotateReadiness(plan, [rice]).readyMeals, 1);
});

test("checking a purchase stocks it once, covers shopping and can be consumed", async (t) => {
  const rice = { _id: new Types.ObjectId(), name: "rice", quantity: 100, unit: "g" };
  let stock: any[] = [];
  t.mock.method(PantryItem, "updateOne", async (filter: any, update: any, options: any) => {
    assert.equal(options.upsert, true);
    if (!stock.some((p) => String(p._id) === String(filter._id))) {
      stock.push({ _id: filter._id, ...update.$setOnInsert });
    }
    return { acknowledged: true };
  });
  t.mock.method(PantryItem, "find", () => ({ sort: () => ({ lean: async () => stock }) }));
  t.mock.method(PantryItem, "deleteOne", async () => { stock = []; return { acknowledged: true }; });
  await stockShoppingItem("user", rice);
  await stockShoppingItem("user", rice);
  assert.equal(stock.length, 1);
  assert.equal(stock[0].quantity, 100);
  assert.equal(stock[0].source, "groceries");
  assert.deepEqual(buildShoppingList([{ ingredients: [rice] }], stock), []);
  assert.deepEqual(await previewConsumption("user", [rice]), []);
  await consumeIngredients("user", [rice]);
  assert.deepEqual(stock, []);
});
