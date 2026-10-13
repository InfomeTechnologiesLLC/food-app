import { test } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import { presentIngredient } from "../src/lib/pantry.js";
import { canonicalStock, stockFingerprint } from "../src/lib/add-stock.js";
import { planConsumption } from "../src/lib/consume.js";
import type { IngredientStock } from "../src/domain/pantry.js";
const batch = (quantity: number, expiryDate: Date | null = null, unit = "pcs") => ({ _id: new Types.ObjectId(), quantity, expiryDate, unit, source: "manual" as const });
const stock = (batches: IngredientStock["batches"]): IngredientStock => ({ _id: new Types.ObjectId(), userId: new Types.ObjectId(), key: "banana", name: "banana", category: "produce", batches });
test("totals and expiry order come from an ingredient's batches without changing stock", () => {
  const ingredient = stock([batch(3), batch(4, new Date("2026-10-17")), batch(2, new Date("2026-10-14"))]);
  const presented = presentIngredient(ingredient);
  assert.deepEqual(presented.totals, [{ unit: "pcs", quantity: 9 }]);
  assert.deepEqual(presented.batches.map((batch) => batch.quantity), [2, 4, 3]);
  assert.equal(ingredient.batches[0]!.quantity, 3);
});
test("inputs convert compatible units and ordinary plurals", () => {
  const rice = canonicalStock({ name: " RICE ", quantity: 1.5, unit: "kg", category: "grains", expiryDate: null, source: "manual" });
  assert.equal(rice.unit, "g"); assert.equal(rice.quantity, 1500);
  const banana = canonicalStock({ ...rice, name: "BANANAS", unit: "pieces", quantity: 7 });
  assert.equal(banana.name, "banana"); assert.equal(banana.unit, "pcs");
  assert.throws(() => canonicalStock({ ...rice, quantity: 0 }));
});
test("incompatible stock stays distinct and cannot cover a meal", () => {
  const ingredient = stock([batch(3), batch(200, null, "g")]);
  assert.equal(presentIngredient(ingredient).totals.length, 2);
  assert.deepEqual(planConsumption([ingredient], [{ name: "banana", quantity: 4, unit: "pcs" }]).shortages, [{ name: "banana", quantity: 4, unit: "pcs", have: 3, shortage: 1, unitMismatch: true, incompatibleStock: [{ name: "banana", quantity: 200, unit: "g" }] }]);
});
test("cooking uses earliest expiry, removes exhausted batches and preserves fractions", () => {
  const earliest = batch(2, new Date("2026-10-14"));
  const result = planConsumption([stock([batch(3, new Date("2026-10-17")), earliest])], [{ name: "bananas", quantity: 4, unit: "pcs" }]);
  assert.equal(String(result.deductions[0]!.batchId), String(earliest._id));
  assert.deepEqual(result.remaining[0]!.batches.map((batch) => batch.quantity), [1]);
  assert.equal(earliest.quantity, 2);
  const fraction = planConsumption([stock([batch(0.015, null, "g")])], [{ name: "banana", quantity: 0.005, unit: "g" }]);
  assert.equal(fraction.remaining[0]!.batches[0]!.quantity, 0.01);
  assert.equal(fraction.deductions[0]!.amount, 0.005);
});

test("operation fingerprints compare canonical values rather than object property order", () => {
  const first = { name: "bananas", quantity: 3, unit: "pieces", category: "produce" as const, expiryDate: null, source: "manual" as const };
  const second = { source: first.source, category: first.category, expiryDate: first.expiryDate, unit: "pcs", quantity: 3, name: "banana" };
  assert.equal(stockFingerprint([first]), stockFingerprint([second]));
});
