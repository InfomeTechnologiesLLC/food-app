/**
 * Turns "eaten so far" and the daily targets into plain advice for the Today screen.
 * Pure functions (no React) so every rule can be tested. General guidance, not medical advice.
 */

export interface Macros { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number }
export type Tone = 'good' | 'info' | 'warn';
export interface NutrientRow { key: keyof Macros; label: string; unit: string; eaten: number; target: number; left: number; percent: number }

export interface DayInput {
  eaten: Macros;
  targets: Macros & { direction: 'lose' | 'gain' | 'maintain' };
  /** Nutrition of the planned meals not eaten yet today */
  plannedLeft: Macros;
  mealsLeft: number;
  /** Local hour, 0–23 */
  hour: number;
}

/** Within this share of the calorie target counts as "on target". */
export const CALORIE_BAND = 0.1;

const LABELS: [keyof Macros, string, string][] = [
  ['calories', 'Calories', 'kcal'], ['proteinGrams', 'Protein', 'g'], ['carbsGrams', 'Carbs', 'g'], ['fatGrams', 'Fat', 'g'],
];

export function nutrientRows(eaten: Macros, targets: Macros): NutrientRow[] {
  return LABELS.map(([key, label, unit]) => {
    const e = Math.round(eaten[key]); const t = Math.round(targets[key]);
    return { key, label, unit, eaten: e, target: t, left: t - e, percent: t > 0 ? Math.round((e / t) * 100) : 0 };
  });
}

/** One headline and one or two sentences of advice for right now. */
export function dayAdvice(i: DayInput): { tone: Tone; title: string; detail: string } {
  const { eaten, targets: t } = i;
  const kcalLeft = Math.round(t.calories - eaten.calories);
  const proteinLeft = Math.round(t.proteinGrams - eaten.proteinGrams);
  const calShare = eaten.calories / t.calories;
  const proteinShare = eaten.proteinGrams / t.proteinGrams;

  if (eaten.calories <= 0) {
    return i.hour < 11
      ? { tone: 'info', title: 'A fresh start', detail: `Today aim for about ${t.calories} kcal and ${t.proteinGrams} g protein. Start with a good breakfast.` }
      : { tone: 'info', title: 'Nothing logged yet today', detail: `Mark meals as eaten so I can check them against your ${t.calories} kcal and ${t.proteinGrams} g protein targets.` };
  }

  if (calShare > 1 + CALORIE_BAND) {
    return t.direction === 'gain'
      ? { tone: 'info', title: 'Calories done for today', detail: `You are about ${-kcalLeft} kcal over. That's fine while building muscle; just don't go far beyond it.` }
      : { tone: 'warn', title: 'Over today’s calories', detail: `You are about ${-kcalLeft} kcal over your target. Keep the rest of today light and drink water. One day won’t undo your progress.` };
  }

  if (calShare >= 1 - CALORIE_BAND) {
    return proteinShare >= 0.9
      ? { tone: 'good', title: 'Targets reached', detail: 'You hit your calories and protein today. Great work, keep it up tomorrow.' }
      : { tone: 'warn', title: 'Calories done, protein short', detail: `You still need about ${proteinLeft} g protein. If you eat more today, make it something high in protein and low in fat.` };
  }

  // Still under target: compare what is left with what is planned
  const plannedTotal = eaten.calories + i.plannedLeft.calories;
  const parts: string[] = [`About ${kcalLeft} kcal and ${Math.max(0, proteinLeft)} g protein left today.`];
  if (proteinShare < calShare - 0.15 && proteinLeft > 15) parts.push('Protein is falling behind, so choose protein-rich food next.');
  if (i.mealsLeft > 0) {
    const gap = Math.round(t.calories - plannedTotal);
    if (gap > t.calories * CALORIE_BAND) parts.push(`Your ${i.mealsLeft} remaining planned ${i.mealsLeft === 1 ? 'meal leaves' : 'meals leave'} you about ${gap} kcal short, so add a snack or a bigger portion.`);
    else if (-gap > t.calories * CALORIE_BAND) parts.push(`Your remaining planned meals would take you about ${-gap} kcal over, so have smaller portions.`);
    else parts.push(`Your ${i.mealsLeft} remaining planned ${i.mealsLeft === 1 ? 'meal covers' : 'meals cover'} this.`);
  } else if (i.hour >= 20 && calShare < 0.75) {
    parts.push(t.direction === 'lose'
      ? 'Eating far too little slows progress and costs muscle, so have a proper meal.'
      : 'Have a proper meal or snack so you don’t fall short.');
  }
  return { tone: 'info', title: i.hour >= 20 ? 'Finish the day well' : 'On your way', detail: parts.join(' ') };
}

/** Breakfast until 10:30, lunch until 15:00, snack until 17:30, then dinner (same rule as the server coach). */
export function mealTypeForNow(now = new Date()): 'breakfast' | 'lunch' | 'snack' | 'dinner' {
  const hour = now.getHours() + now.getMinutes() / 60;
  return hour < 10.5 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 17.5 ? 'snack' : 'dinner';
}

/** Adds days to a local YYYY-MM-DD date. */
export function addDaysLocal(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
