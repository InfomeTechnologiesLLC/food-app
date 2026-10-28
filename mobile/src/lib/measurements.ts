/**
 * Measurements are stored in centimetres and kilograms; blank fields remove them.
 * `target` is optional: leave it out to keep the saved target weight unchanged.
 */
export function parseMeasurements(height: string, weight: string, target?: string) {
  const parse = (text: string, label: string, min: number, max: number) => {
    const normalized = text.trim().replace(',', '.');
    if (!normalized) return null;
    const value = Number(normalized);
    if (!/^\d+(\.\d+)?$/.test(normalized) || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${label} must be between ${min} and ${max}.`);
    }
    return value;
  };
  return {
    heightCm: parse(height, 'Height in cm', 50, 250),
     weightKg: parse(weight, 'Weight in kg', 10, 500),
    ...(target === undefined ? {} : { targetWeightKg: parse(target, 'Target weight in kg', 10, 500) }),
  };
}

export function calculateBmi(heightCm?: number | null, weightKg?: number | null): number | null {
  if (!heightCm || !weightKg || !Number.isFinite(heightCm) || !Number.isFinite(weightKg)
    || heightCm < 50 || heightCm > 250 || weightKg < 10 || weightKg > 500) return null;
  return weightKg / ((heightCm / 100) ** 2);
}
