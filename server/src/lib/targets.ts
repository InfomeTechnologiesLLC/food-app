/**
 * Daily nutrition and water targets, worked out in plain deterministic code (never by the AI).
 *
 * BMR: Mifflin-St Jeor. TDEE: BMR × activity factor. The calorie target moves TDEE by the
 * deficit or surplus needed for a safe weekly rate (7700 kcal ≈ 1 kg of body weight), within
 * safety limits. Protein is set per kg, fat as a share of calories and carbs fill the rest.
 *
 * General guidance only, not medical advice.
 */

export const SEXES = ["male", "female"] as const;
export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export type Sex = (typeof SEXES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type Direction = "lose" | "gain" | "maintain";

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};
/** Healthy weekly change in kg: the default pace and the fastest allowed. */
export const RATES = { lose: { min: 0.25, normal: 0.5, max: 1 }, gain: { min: 0.25, normal: 0.25, max: 0.5 } } as const;
export const KCAL_PER_KG = 7700;
/** Never plan below these, whatever the maths says. */
export const CALORIE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };
/** A deficit never takes more than this share of TDEE. */
export const MAX_DEFICIT_SHARE = 0.25;
/** A target within this many kg of the current weight means "maintain". */
const SAME_WEIGHT_KG = 0.5;
/** Age used until the user adds a birth year, so targets are shown straight away. */
export const DEFAULT_AGE = 30;
export const NOTICE = "These targets are general guidance, not medical advice. If you are pregnant or breastfeeding, or have a medical condition such as diabetes, kidney or heart disease, ask a doctor or dietitian before following them.";

export interface TargetInput {
  sex: Sex | null;
  /** Age is worked out from the birth year, so it can be up to a year off. */
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  /** The nutrition goal from preferences: balanced | weight_loss | muscle_gain */
  goal: string;
  activityLevel: ActivityLevel | null;
  /** Weeks the user would like to reach the target in (optional). */
  goalWeeks: number | null;
  /** Calendar year used to work out the age; pass it in so results are repeatable. */
  year: number;
  /** Calories added (or taken away) by the weekly check-in. Safety limits still apply after it. */
  adjustmentKcal?: number;
}

export interface Timeline {
  /** Weeks to the target at the planned pace */
  weeks: number;
  /** What the user asked for, if anything */
  requestedWeeks: number | null;
  /** True when the requested time was too fast and the safe pace is used instead */
  adjusted: boolean;
  explanation: string;
}

export interface Targets {
  ready: true;
  age: number;
  bmr: number;
  tdee: number;
  calories: number;
  /** The part of `calories` that came from weekly check-ins (after safety limits) */
  adjustmentKcal: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterMl: number;
  direction: Direction;
  /** Planned kg per week (negative = losing). 0 when maintaining. */
  weeklyRateKg: number;
  timeline: Timeline | null;
  warnings: string[];
  notice: string;
}

export interface MissingTargets {
  ready: false;
  /** Profile fields still needed for the nutrition targets (birth year is optional: an age of 30 is assumed) */
  missing: ("sex" | "heightCm" | "weightKg" | "activityLevel")[];
  /** Water only needs the weight, so it is available sooner */
  waterMl: number;
  notice: string;
}

const round = (n: number, step = 1) => Math.round(n / step) * step;

/** About 35 ml per kg, more for active people, kept between 1.5 and 4 litres. 2 litres when the weight is unknown. */
export function waterTarget(weightKg: number | null, activity: ActivityLevel | null) {
  if (!weightKg) return 2000;
  const extra = activity === "active" || activity === "very_active" ? 500 : 0;
  return Math.min(4000, Math.max(1500, round(weightKg * 35 + extra, 50)));
}

export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

/** Lose, gain or maintain. A target weight decides; without one, the nutrition goal does. */
export function direction(weightKg: number, targetWeightKg: number | null, goal: string): Direction {
  if (targetWeightKg !== null) {
    if (targetWeightKg < weightKg - SAME_WEIGHT_KG) return "lose";
    if (targetWeightKg > weightKg + SAME_WEIGHT_KG) return "gain";
    return "maintain";
  }
  return goal === "weight_loss" ? "lose" : goal === "muscle_gain" ? "gain" : "maintain";
}

/**
 * A sensible target weight from height, weight and the nutrition goal, rounded to 0.5 kg:
 * - weight loss: lose 10% of the weight, but not below a BMI of 22 (20 when already under 22; none at 20 or less)
 * - muscle gain: gain 5%, but not above a BMI of 25; underweight people aim for a BMI of 20
 * - balanced: keep the current weight
 */
export function suggestTargetWeight(heightCm: number, weightKg: number, goal: string) {
  const sq = (heightCm / 100) ** 2;
  const atBmi = (b: number) => b * sq;
  const bmi = weightKg / sq;
  const half = (n: number) => Math.round(n * 2) / 2;
  let target = weightKg;
  // Loss stops at BMI 22, or at BMI 20 for people already below 22
  if (goal === "weight_loss" && bmi > 20) target = Math.min(weightKg, Math.max(weightKg * 0.9, atBmi(bmi > 22 ? 22 : 20)));
  if (goal === "muscle_gain") target = bmi < 18.5 ? atBmi(20) : Math.max(weightKg, Math.min(weightKg * 1.05, atBmi(25)));
  // Too small a change to plan for: keep the current weight
  return Math.abs(target - weightKg) <= SAME_WEIGHT_KG ? half(weightKg) : half(target);
}

const weeksText = (w: number) => `${w} ${w === 1 ? "week" : "weeks"}`;

export function calculateTargets(i: TargetInput): Targets | MissingTargets {
  const missing = (["sex", "heightCm", "weightKg", "activityLevel"] as const).filter((k) => i[k] === null || i[k] === undefined);
  if (missing.length) return { ready: false, missing: [...missing], waterMl: waterTarget(i.weightKg, i.activityLevel), notice: NOTICE };
  const sex = i.sex!; const weight = i.weightKg!; const height = i.heightCm!; const activity = i.activityLevel!;
  const age = i.birthYear ? i.year - i.birthYear : DEFAULT_AGE;
  const warnings: string[] = [];
  if (!i.birthYear) warnings.push(`Add your birth year in Profile for more exact targets. Until then an age of ${DEFAULT_AGE} is used.`);

  const base = bmr(sex, weight, height, age);
  const tdee = base * ACTIVITY_FACTOR[activity];
  const bmi = weight / (height / 100) ** 2;
  let dir = direction(weight, i.targetWeightKg, i.goal);

  // Safety: no deficit or surplus for minors, and no weight loss when already underweight
  if (age < 18 && dir !== "maintain") {
    warnings.push("You are under 18, so these targets keep your weight steady while you grow. Talk to a doctor before trying to lose or gain weight.");
    dir = "maintain";
  }
  if (bmi < 18.5) {
    if (dir === "lose") {
      warnings.push(`Your BMI is ${bmi.toFixed(1)}, below the healthy range, so weight loss is not planned. Please talk to a doctor or dietitian.`);
      dir = "maintain";
    } else warnings.push(`Your BMI is ${bmi.toFixed(1)}, below the healthy range. Gaining slowly is a good idea; a doctor or dietitian can help.`);
  }

  // Pace: the user's timeframe if it is safe, otherwise the fastest safe pace
  let rate = 0;
  let requestedRate: number | null = null;
  const toTarget = i.targetWeightKg !== null ? Math.abs(i.targetWeightKg - weight) : null;
  if (dir !== "maintain") {
    const limits = RATES[dir];
    requestedRate = toTarget !== null && i.goalWeeks ? toTarget / i.goalWeeks : null;
    rate = requestedRate === null ? limits.normal : Math.min(requestedRate, limits.max);
  }

  // Calories, with a cap on the deficit and a minimum floor
  let calorieCapped = false;
  const change = (rate * KCAL_PER_KG) / 7;
  let calories = dir === "lose" ? tdee - change : dir === "gain" ? tdee + change : tdee;
  if (dir === "lose") {
    const lowest = Math.max(tdee * (1 - MAX_DEFICIT_SHARE), CALORIE_FLOOR[sex]);
    if (calories < lowest) {
      calories = lowest;
      const capped = Math.max(0, ((tdee - calories) * 7) / KCAL_PER_KG);
      warnings.push(capped < 0.1
        ? `Your daily energy needs are already close to the safe minimum of ${CALORIE_FLOOR[sex]} kcal, so the plan keeps your weight steady. More activity, or a doctor's advice, can help you lose weight safely.`
        : `To keep your calories at a safe level, the plan aims for about ${capped.toFixed(2)} kg a week.`);
      rate = capped;
      calorieCapped = true;
    }
  }
  if (calories < CALORIE_FLOOR[sex]) calories = CALORIE_FLOOR[sex];
  calories = round(calories, 10);
  if (dir === "lose" && rate < 0.05) { dir = "maintain"; rate = 0; }

  // Weekly check-in adjustment, still within the deficit cap and the calorie floor
  const planned = calories;
  if (i.adjustmentKcal) {
    calories = round(Math.max(calories + i.adjustmentKcal, tdee * (1 - MAX_DEFICIT_SHARE), CALORIE_FLOOR[sex]), 10);
  }
  const adjustmentKcal = calories - planned;

  // Timeline to the target weight
  let timeline: Timeline | null = null;
  if (toTarget !== null && dir !== "maintain" && rate > 0) {
    const weeks = Math.ceil(toTarget / rate);
    const tooFast = requestedRate !== null && requestedRate > RATES[dir].max;
    const verb = dir === "lose" ? "lose" : "gain";
    const pace = `At about ${rate.toFixed(2)} kg a week you can ${verb} ${toTarget.toFixed(1)} kg in about ${weeksText(weeks)}.`;
    const why = [
      tooFast && `${verb === "lose" ? "Losing" : "Gaining"} ${toTarget.toFixed(1)} kg in ${weeksText(i.goalWeeks!)} would mean ${requestedRate!.toFixed(2)} kg a week, above the healthy maximum of ${RATES[dir].max} kg a week.`,
      calorieCapped && "Your calories are kept at a safe level, which sets the pace.",
    ].filter(Boolean).join(" ");
    timeline = {
      weeks, requestedWeeks: i.goalWeeks ?? null, adjusted: tooFast || (calorieCapped && i.goalWeeks !== null && weeks > i.goalWeeks),
      explanation: why ? `${why} ${pace}` : pace,
    };
  }

  // Macros. Protein per kg (a BMI 25 reference weight above BMI 30, so it stays realistic), fat 25%, carbs the rest.
  const proteinWeight = bmi >= 30 ? 25 * (height / 100) ** 2 : weight;
  const proteinPerKg = dir === "lose" ? 2.0 : dir === "gain" ? 1.8 : 1.6;
  const proteinGrams = round(proteinWeight * proteinPerKg);
  let fatGrams = round((calories * 0.25) / 9);
  let carbsGrams = round((calories - proteinGrams * 4 - fatGrams * 9) / 4);
  if (carbsGrams < 50) {
    // Very low calorie targets: trim fat to 20% so carbs don't vanish
    fatGrams = round((calories * 0.2) / 9);
    carbsGrams = Math.max(0, round((calories - proteinGrams * 4 - fatGrams * 9) / 4));
  }

  if (i.targetWeightKg !== null && dir === "maintain" && toTarget !== null && toTarget > SAME_WEIGHT_KG && warnings.length === 0) {
    warnings.push("Your targets keep your weight steady right now.");
  }

  return {
    ready: true, age, bmr: round(base), tdee: round(tdee), calories, adjustmentKcal, proteinGrams, carbsGrams, fatGrams,
    waterMl: waterTarget(weight, activity), direction: dir,
    weeklyRateKg: dir === "maintain" ? 0 : Number(((dir === "lose" ? -1 : 1) * rate).toFixed(2)),
    timeline, warnings, notice: NOTICE,
  };
}
