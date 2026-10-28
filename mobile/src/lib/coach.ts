// Relative imports so the server test runner (plain Node) can load this file
import { calculateBmi } from './measurements';
import type { WeightEntry } from './weight';

/**
 * Rule-based coaching: turns the user's weight, meals and workouts into a plain-language status and next steps.
 * Pure functions (no React) so every rule can be tested. General guidance only, not medical advice.
 */

/** Weight changes per week that count as healthy for each goal, in kg (loss 0.25–1, gain 0.25–0.5). */
export const LOSS_RANGE = { min: 0.25, max: 1 } as const;
export const GAIN_RANGE = { min: 0.25, max: 0.5 } as const;
export const STEADY_BAND = 0.3;
/** WHO adult BMI cut-offs. */
export const BMI_CUTOFFS = { under: 18.5, over: 25, obese: 30 } as const;
export const TREND_WINDOW_DAYS = 28;
export const WEIGH_IN_DUE_DAYS = 7;

interface Rate { percent: number | null; planned: number; done: number }
export interface CoachInput {
  goal: string;
  heightCm?: number | null;
  weightKg?: number | null;
  targetWeightKg?: number | null;
  /** Oldest first */
  weights: WeightEntry[];
  today: string;
  food: { hasPlan: boolean; rate: Rate; todayDone: number; todayPlanned: number };
  exercise: { enabled: boolean; hasPlan: boolean; rate: Rate; todayPlanned: boolean; todayDone: boolean; daysSinceLast: number | null; missed: number };
}

export type WeightStatus = 'on_track' | 'watch' | 'start';
export type Level = 'great' | 'okay' | 'attention' | 'good' | 'start';
export interface Tip { id: string; text: string; icon: string; href?: string; cta?: string }

const noon = (date: string) => new Date(`${date}T12:00:00`).getTime();
export const daysBetween = (from: string, to: string) => Math.round((noon(to) - noon(from)) / 86400000);
const kg = (n: number) => Math.abs(n).toFixed(1);

/** Kilograms per week from a least-squares line through the last 28 days of weigh-ins; null until they span a week. */
export function weeklyTrend(weights: WeightEntry[], today: string): number | null {
  const pts = weights.filter((w) => daysBetween(w.date, today) < TREND_WINDOW_DAYS && w.date <= today);
  if (pts.length < 2) return null;
  const x = pts.map((p) => daysBetween(pts[0]!.date, p.date));
  if (x[x.length - 1]! < 7) return null;
  const n = pts.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = pts.reduce((a, p) => a + p.weightKg, 0) / n;
  const num = pts.reduce((a, p, i) => a + (x[i]! - mx) * (p.weightKg - my), 0);
  const den = x.reduce((a, v) => a + (v - mx) ** 2, 0);
  return den === 0 ? null : Math.round((num / den) * 7 * 100) / 100;
}

export function bmiLabel(bmi: number | null) {
  if (bmi === null) return null;
  return bmi < BMI_CUTOFFS.under ? 'Below healthy range' : bmi < BMI_CUTOFFS.over ? 'Healthy range' : bmi < BMI_CUTOFFS.obese ? 'Above healthy range' : 'Well above healthy range';
}

export function assessWeight(i: CoachInput) {
  const latest = i.weights.at(-1);
  const current = latest?.weightKg ?? i.weightKg ?? null;
  const bmi = calculateBmi(i.heightCm, current);
  const perWeek = weeklyTrend(i.weights, i.today);
  const target = i.targetWeightKg ?? null;
  const toTarget = target !== null && current !== null ? Math.round((target - current) * 10) / 10 : null;
  const etaWeeks = perWeek !== null && toTarget && Math.abs(perWeek) >= 0.1 && Math.sign(perWeek) === Math.sign(toTarget) ? Math.ceil(Math.abs(toTarget) / Math.abs(perWeek)) : null;
  const base = { current, bmi, bmiLabel: bmiLabel(bmi), perWeek, target, toTarget, etaWeeks: etaWeeks !== null && etaWeeks <= 104 ? etaWeeks : null,
    daysSinceWeighIn: latest ? daysBetween(latest.date, i.today) : null };
  const out = (status: WeightStatus, headline: string, detail: string) => ({ ...base, status, headline, detail });

  if (current === null) return out('start', 'Add your weight', 'Log your weight to see whether you are moving toward your goal.');
  if (bmi !== null && bmi < BMI_CUTOFFS.under && (i.goal === 'weight_loss' || (perWeek ?? 0) < -LOSS_RANGE.min)) {
    return out('watch', 'Weight is below the healthy range', `BMI ${bmi.toFixed(1)} is under ${BMI_CUTOFFS.under}. Consider a Balanced or Muscle gain goal, and talk to a doctor or dietitian.`);
  }
  if (perWeek === null) {
    return out('start', i.weights.length < 2 ? 'First weigh-in saved' : 'Not enough data for a trend yet', 'Weigh in once a week at the same time of day. After about a week we can show your trend.');
  }
  const p = perWeek;
  if (i.goal === 'weight_loss') {
    if (p < -LOSS_RANGE.max) return out('watch', 'Losing faster than recommended', `About ${kg(p)} kg a week. A steady 0.25 to 1 kg a week is easier to keep. Make sure you eat all your planned meals.`);
    if (p <= -LOSS_RANGE.min) return out('on_track', 'Losing steadily', `About ${kg(p)} kg a week, which is a healthy pace.`);
    if (p < LOSS_RANGE.min) return out('watch', 'Weight is not moving yet', 'Your goal is weight loss. Stick to your planned meals and add a workout this week.');
    return out('watch', 'Weight is going up', `Up about ${kg(p)} kg a week. Compare your portions with the plan and add some movement.`);
  }
  if (i.goal === 'muscle_gain') {
      if (p >= GAIN_RANGE.min && p <= GAIN_RANGE.max) return out('on_track', 'Gaining steadily', `About ${kg(p)} kg a week, a good pace for building muscle.`);
    if (p > GAIN_RANGE.max) return out('watch', 'Gaining quickly', `Up about ${kg(p)} kg a week. Gains faster than about ${GAIN_RANGE.max} kg a week are often mostly fat.`);
    if (p > -GAIN_RANGE.min) return out('watch', 'Weight is not moving yet', 'To build muscle, eat all your planned meals and keep training with gradually heavier weights.');
    return out('watch', 'Weight is dropping', `Down about ${kg(p)} kg a week. Eat all your planned meals, especially the protein.`);
  }
  if (Math.abs(p) <= STEADY_BAND) return out('on_track', 'Weight is steady', 'Your weight is stable, which fits a balanced goal.');
  return out('watch', 'Weight is changing', `${p > 0 ? 'Up' : 'Down'} about ${kg(p)} kg a week. If that is not what you want, review your meals and activity.`);
}

export function buildCoach(i: CoachInput) {
  const weight = assessWeight(i);
  const rates = [i.food.hasPlan ? i.food.rate.percent : null, i.exercise.enabled && i.exercise.hasPlan ? i.exercise.rate.percent : null].filter((n): n is number => n !== null);
  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  const parts = [
    i.food.rate.percent !== null && `Meals ${i.food.rate.percent}%`,
    i.exercise.rate.percent !== null && `Workouts ${i.exercise.rate.percent}%`,
    weight.status !== 'start' && weight.headline,
  ].filter(Boolean).join(' · ');
  let level: Level; let title: string; let detail: string;
  if (avg === null) {
    level = weight.status === 'on_track' ? 'good' : 'start';
    title = level === 'good' ? 'Your weight is on track' : "Let's get you started";
    detail = level === 'good' ? weight.detail : 'Create a meal plan, log your weight, and your progress will show up here.';
  } else if (avg >= 80) {
    level = weight.status === 'watch' ? 'okay' : 'great';
    title = level === 'great' ? "You're following a healthy routine" : 'Mostly on track';
    detail = `${parts} over the last 7 days.`;
  } else if (avg >= 50) {
    level = 'okay'; title = 'Mostly on track'; detail = `${parts} over the last 7 days.`;
  } else {
    level = 'attention'; title = 'Needs attention'; detail = `${parts} over the last 7 days. Small steps today will turn it around.`;
  }

  const tips: Tip[] = [];
  const add = (tip: Tip) => tips.push(tip);
  const left = i.food.todayPlanned - i.food.todayDone;
  if (i.exercise.enabled && i.exercise.todayPlanned && !i.exercise.todayDone) add({ id: 'workout-today', icon: 'barbell-outline', text: "Today's workout is planned. Even a short session counts.", href: '/exercise', cta: 'Open workout' });
  if (left > 0) add({ id: 'meals-left', icon: 'restaurant-outline', text: `${left} planned ${left === 1 ? 'meal is' : 'meals are'} left today. Mark each one as eaten after you have it.`, href: '/plans', cta: 'Open meals' });
  if (!i.food.hasPlan) add({ id: 'meal-plan', icon: 'restaurant-outline', text: 'Create a meal plan so we can track what you eat against it.', href: '/plans', cta: 'Plan meals' });
  if (i.exercise.enabled && !i.exercise.hasPlan) add({ id: 'workout-plan', icon: 'barbell-outline', text: 'Create a workout plan to schedule your training days.', href: '/exercise', cta: 'Plan workouts' });
  if (!i.exercise.enabled && (i.goal === 'weight_loss' || i.goal === 'muscle_gain')) {
    add({ id: 'enable-exercise', icon: 'barbell-outline', text: i.goal === 'muscle_gain' ? 'Strength training is the biggest driver of muscle gain. Exercise is optional, but worth setting up.' : 'Adding exercise helps with weight loss. It is optional, and you can start small.', href: '/training-settings', cta: 'Set up exercise' });
  }
  if (i.food.hasPlan && i.food.rate.percent !== null && i.food.rate.percent < 80) add({ id: 'food-behind', icon: 'trending-down-outline', text: `You ate ${i.food.rate.done} of ${i.food.rate.planned} planned meals this week. Aim to log every meal tomorrow.`, href: '/progress', cta: 'See details' });
  if (i.exercise.enabled && i.exercise.hasPlan && i.exercise.missed > 0) add({ id: 'workouts-missed', icon: 'trending-down-outline', text: `${i.exercise.missed} planned ${i.exercise.missed === 1 ? 'workout was' : 'workouts were'} missed this week. Try to fit in the next one.`, href: '/exercise', cta: 'Open exercise' });
  if (weight.daysSinceWeighIn === null || weight.daysSinceWeighIn >= WEIGH_IN_DUE_DAYS) add({ id: 'weigh-in', icon: 'scale-outline', text: weight.daysSinceWeighIn === null ? 'Log your weight to start tracking your progress.' : `It has been ${weight.daysSinceWeighIn} days since your last weigh-in.`, cta: 'Log weight' });
  if (weight.status === 'watch' && weight.detail) add({ id: 'weight-advice', icon: 'scale-outline', text: weight.detail });
  if (i.targetWeightKg && weight.current !== null) {
    const wrongWay = (i.goal === 'weight_loss' && i.targetWeightKg > weight.current + 0.5) || (i.goal === 'muscle_gain' && i.targetWeightKg < weight.current - 0.5);
    if (wrongWay) add({ id: 'target-mismatch', icon: 'flag-outline', text: 'Your target weight points the opposite way from your nutrition goal. Update one of them so the advice matches.', href: '/settings', cta: 'Open profile' });
  }
  if (tips.length === 0) add({ id: 'keep-going', icon: 'checkmark-circle-outline', text: 'Nothing needs fixing right now. Keep logging your meals and workouts.' });

  return { level, title, detail, weight, tips: tips.slice(0, 4) };
}
