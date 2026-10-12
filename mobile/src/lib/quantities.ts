/** Scale metric ingredient quantities for display without changing stored values. */
export function formatQty(quantity: number, unit: string): string {
  const normalized = unit.trim().toLowerCase().replace(/\.$/, '');
  const massFactors: Record<string, number> = {
    mg: 0.001, milligram: 0.001, milligrams: 0.001,
    g: 1, gram: 1, grams: 1,
    kg: 1000, kilogram: 1000, kilograms: 1000,
  };
  const volumeFactors: Record<string, number> = {
    ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1,
    l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
  };
  let value = quantity;
  let displayUnit = unit;
  if (Number.isFinite(quantity) && quantity !== 0) {
    if (massFactors[normalized] !== undefined) {
      const grams = quantity * massFactors[normalized];
      const magnitude = Math.abs(grams);
      const factor = magnitude >= 1000 ? 1000 : magnitude >= 1 ? 1 : 0.001;
      value = grams / factor;
      displayUnit = factor === 1000 ? 'kg' : factor === 1 ? 'g' : 'mg';
    } else if (volumeFactors[normalized] !== undefined) {
      const milliliters = quantity * volumeFactors[normalized];
      const factor = Math.abs(milliliters) >= 1000 ? 1000 : 1;
      value = milliliters / factor;
      displayUnit = factor === 1000 ? 'L' : 'ml';
    }
  }
  // Significant digits remove floating-point noise while preserving small amounts.
  return `${Number(value.toPrecision(12))} ${displayUnit}`;
}
