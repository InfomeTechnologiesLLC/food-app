/**
 * Pure planning for the meal, workout and weigh-in reminders (no React Native imports, so it is easy to test).
 * Reminders are scheduled on the phone for the next few days and rebuilt whenever the app sees new data, so
 * anything already done today is skipped.
 */
export type ActivityKind = 'meal-reminder' | 'workout-reminder' | 'weigh-in-reminder';

export interface ActivityReminder { kind: ActivityKind; date: Date; title: string; body: string; url: string }

export interface ActivityState {
  now: Date;
  /** Local calendar date, YYYY-MM-DD */
  today: string;
  meals: { enabled: boolean; hour: number; planDates: string[]; eatenToday: number; plannedToday: number };
  workout: { enabled: boolean; hour: number; plannedDates: string[]; doneToday: boolean };
  /** Weekly, on Sundays. `daysSinceLast` is null when the user has never logged a weight. */
  weighIn: { enabled: boolean; hour: number; daysSinceLast: number | null };
}

export const HORIZON_DAYS = 7;
const WEIGH_IN_WEEKS = 2;

const at = (date: string, hour: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour);
};
const addDays = (date: string, days: number) => {
  const d = at(date, 12);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function planActivityReminders(s: ActivityState): ActivityReminder[] {
  const out: ActivityReminder[] = [];
  const horizon = Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(s.today, i));
  const future = (date: string, hour: number) => (at(date, hour) > s.now ? at(date, hour) : null);

  if (s.meals.enabled) {
    for (const date of horizon.filter((d) => s.meals.planDates.includes(d))) {
      const fireAt = future(date, s.meals.hour);
      if (!fireAt) continue;
      const isToday = date === s.today;
      if (isToday && s.meals.plannedToday > 0 && s.meals.eatenToday >= s.meals.plannedToday) continue; // all done
      out.push({
        kind: 'meal-reminder', date: fireAt, url: '/plans',
        title: 'Meal check-in',
        body: isToday && s.meals.plannedToday > 0
          ? s.meals.eatenToday === 0 ? "You haven't logged any meals today. Tap to mark what you ate." : `You've logged ${s.meals.eatenToday} of ${s.meals.plannedToday} meals today. Tap to log the rest.`
          : "Did you eat your planned meals today? Tap to log them.",
      });
    }
  }

  if (s.workout.enabled) {
    for (const date of horizon.filter((d) => s.workout.plannedDates.includes(d))) {
      const fireAt = future(date, s.workout.hour);
      if (!fireAt) continue;
      if (date === s.today && s.workout.doneToday) continue;
      out.push({ kind: 'workout-reminder', date: fireAt, url: '/exercise', title: 'Workout time', body: 'Have you done your workout today? Tap to start or log it.' });
    }
  }

  if (s.weighIn.enabled) {
    const lastDate = s.weighIn.daysSinceLast === null ? null : addDays(s.today, -s.weighIn.daysSinceLast);
    const sundays = Array.from({ length: WEIGH_IN_WEEKS * 7 }, (_, i) => addDays(s.today, i)).filter((d) => at(d, 12).getDay() === 0);
    for (const date of sundays) {
      const fireAt = future(date, s.weighIn.hour);
      // Skip a Sunday when the user already weighed in within the last 6 days before it
      if (!fireAt || (lastDate !== null && at(date, 12).getTime() - at(lastDate, 12).getTime() < 6 * 86400000)) continue;
      out.push({ kind: 'weigh-in-reminder', date: fireAt, url: '/progress', title: 'Weekly weigh-in', body: 'Log your weight to see how you are progressing toward your goal.' });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
