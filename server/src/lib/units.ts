/** Unit conversion for pantry deductions. Only converts within mass, volume or count. */
const UNITS: Record<string, { dim: "mass" | "volume" | "count"; factor: number }> = {
  mg: { dim: "mass", factor: 0.001 },
  g: { dim: "mass", factor: 1 },
  gram: { dim: "mass", factor: 1 },
  kg: { dim: "mass", factor: 1000 },
  kilogram: { dim: "mass", factor: 1000 },
  oz: { dim: "mass", factor: 28.35 },
  ounce: { dim: "mass", factor: 28.35 },
  lb: { dim: "mass", factor: 453.6 },
  pound: { dim: "mass", factor: 453.6 },
  ml: { dim: "volume", factor: 1 },
  milliliter: { dim: "volume", factor: 1 },
  millilitre: { dim: "volume", factor: 1 },
  l: { dim: "volume", factor: 1000 },
  liter: { dim: "volume", factor: 1000 },
  litre: { dim: "volume", factor: 1000 },
  tsp: { dim: "volume", factor: 5 },
  teaspoon: { dim: "volume", factor: 5 },
  tbsp: { dim: "volume", factor: 15 },
  tablespoon: { dim: "volume", factor: 15 },
  cup: { dim: "volume", factor: 240 },
  pc: { dim: "count", factor: 1 },
  pcs: { dim: "count", factor: 1 },
  piece: { dim: "count", factor: 1 },
  whole: { dim: "count", factor: 1 },
  unit: { dim: "count", factor: 1 },
  item: { dim: "count", factor: 1 },
  each: { dim: "count", factor: 1 },
  dozen: { dim: "count", factor: 12 },
};

const lookup = (unit: string) => {
  const u = unit.toLowerCase().trim().replace(/\.$/, "");
  return UNITS[u] ?? UNITS[u.replace(/s$/, "")] ?? UNITS[u.replace(/es$/, "")];
};

/** Stable display totals regardless of which purchase batch was inserted first. */
export function stockUnit(unit: string) {
  const dimension = lookup(unit)?.dim;
  return dimension === "mass" ? "g" : dimension === "volume" ? "ml" : dimension === "count" ? "pcs" : unit.trim().toLowerCase();
}

/** Converts `quantity` from one unit to another, or null when they can't be compared (e.g. g → pcs). */
export function convert(quantity: number, from: string, to: string): number | null {
  if (from.toLowerCase().trim() === to.toLowerCase().trim()) return quantity;
  const a = lookup(from);
  const b = lookup(to);
  if (!a || !b || a.dim !== b.dim) return null;
  return (quantity * a.factor) / b.factor;
}
