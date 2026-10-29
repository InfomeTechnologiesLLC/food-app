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

export const ACTIVITY_OPTIONS = [
  ['sedentary', 'Mostly sitting', 'Desk job, little or no exercise'],
  ['light', 'Lightly active', 'Light exercise or walking 1–3 days a week'],
  ['moderate', 'Moderately active', 'Exercise 3–5 days a week'],
  ['active', 'Very active', 'Hard exercise 6–7 days a week'],
  ['very_active', 'Extremely active', 'Physical job plus hard training'],
] as const;
export type ActivityOption = (typeof ACTIVITY_OPTIONS)[number][0];

/** Text fields from the profile form → values for PATCH /me/body. Blank fields remove the value. */
export function parseProfile(draft: { sex: 'male' | 'female' | null; birthYear: string; activityLevel: ActivityOption | null; goalWeeks: string }, year = new Date().getFullYear()) {
  const whole = (text: string, message: string, min: number, max: number) => {
    const t = text.trim();
    if (!t) return null;
    const n = Number(t);
    if (!/^\d+$/.test(t) || n < min || n > max) throw new Error(message);
    return n;
  };
  return {
    sex: draft.sex,
    birthYear: whole(draft.birthYear, `Birth year must be between ${year - 110} and ${year - 10}.`, year - 110, year - 10),
    activityLevel: draft.activityLevel,
    goalWeeks: whole(draft.goalWeeks, 'Timeframe must be between 1 and 260 weeks.', 1, 260),
  };
}
