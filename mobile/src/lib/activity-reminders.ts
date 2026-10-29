/**
 * Pure planning for the meal, workout and weigh-in reminders (no React Native imports, so it is easy to test).
 * Reminders are scheduled on the phone for the next few days and rebuilt whenever the app sees new data, so
 * anything already done today is skipped.
 */
export type ActivityKind = 'meal-reminder' | 'workout-reminder' | 'weigh-in-reminder' | 'water-reminder' | 'missed-workout';

export interface ActivityReminder { kind: ActivityKind; date: Date; title: string; body: string; url: string }

export interface ActivityState {
  now: Date;
  /** Local calendar date, YYYY-MM-DD */
  today: string;
  meals: { enabled: boolean; hour: number; planDates: string[]; eatenToday: number; plannedToday: number };
  /** `missedYesterday`: a planned workout yesterday had no completed sets */
  workout: { enabled: boolean; hour: number; plannedDates: string[]; doneToday: boolean; missedYesterday?: boolean };
  /** No reminders from `start` until `end` (hours, may wrap past midnight), e.g. 22 → 7 */
  quiet?: { enabled: boolean; start: number; end: number };
  /** Weekly, on Sundays. `daysSinceLast` is null when the user has never logged a weight. */
  weighIn: { enabled: boolean; hour: number; daysSinceLast: number | null };
  /** Every `intervalHours` from `startHour` to `endHour` (inclusive). Stops for today once `drankToday` reaches `goalMl`. */
  water?: { enabled: boolean; startHour: number; endHour: number; intervalHours: number; goalMl: number; drankToday: number };
}

export const HORIZON_DAYS = 7;
export const MISSED_NUDGE_HOUR = 9;
/** Water reminders are frequent, so only today and tomorrow are scheduled (iOS keeps at most 64). They are rebuilt on every app open. */
export const WATER_HORIZON_DAYS = 2;
export const WATER_INTERVALS = [2, 3] as const;
const GLASS_ML = 250;

/** How much water should be drunk by `at`, spreading the goal evenly over the reminder window. */
export function waterExpectedMl(goalMl: number, at: Date, startHour: number, endHour: number) {
  const hours = at.getHours() + at.getMinutes() / 60;
  const share = endHour <= startHour ? 1 : Math.min(1, Math.max(0, (hours - startHour) / (endHour - startHour)));
  return Math.round(goalMl * share);
}

const litres = (ml: number) => `${(ml / 1000).toFixed(ml % 100 === 0 ? 1 : 2)} L`;
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
    // A gentle nudge the morning after a missed workout (only while it is still in the future)
    const nudgeAt = future(s.today, MISSED_NUDGE_HOUR);
    if (s.workout.missedYesterday && nudgeAt && !s.workout.doneToday) {
      const plannedToday = s.workout.plannedDates.includes(s.today);
      out.push({
        kind: 'missed-workout', date: nudgeAt, url: '/exercise', title: 'Yesterday’s workout was missed',
        body: plannedToday ? 'No problem. Today’s session is planned. Even 15 minutes keeps you on track.' : 'No problem. A short walk or a quick session today keeps you on track.',
      });
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
  if (s.water?.enabled && s.water.goalMl > 0) {
    const w = s.water;
    const hours: number[] = [];
    for (let h = w.startHour; h <= w.endHour; h += Math.max(1, w.intervalHours)) hours.push(h);
    for (const date of horizon.slice(0, WATER_HORIZON_DAYS)) {
      const isToday = date === s.today;
      if (isToday && w.drankToday >= w.goalMl) continue; // goal reached: no more reminders today
      hours.forEach((hour, n) => {
        const fireAt = future(date, hour);
        if (!fireAt) return;
        let title = 'Time for some water';
        let body = `Have a glass of water. Your goal today is ${litres(w.goalMl)}.`;
        if (isToday) {
          const behind = waterExpectedMl(w.goalMl, fireAt, w.startHour, w.endHour) - w.drankToday > GLASS_ML;
          if (behind) title = 'You are behind on water';
          body = `${litres(w.drankToday)} of ${litres(w.goalMl)} so far. ${behind ? 'Have a glass now to catch up.' : 'Have a glass and log it.'}`;
        } else if (n === 0) {
          title = 'Good morning';
          body = `Start your day with a glass of water. Aim for ${litres(w.goalMl)} today.`;
        }
        out.push({ kind: 'water-reminder', date: fireAt, url: '/', title, body });
      });
    }
  }
  const quiet = s.quiet;
  const isQuiet = (d: Date) => {
    if (!quiet?.enabled || quiet.start === quiet.end) return false;
    const h = d.getHours();
    return quiet.start < quiet.end ? h >= quiet.start && h < quiet.end : h >= quiet.start || h < quiet.end;
  };
  return out.filter((r) => !isQuiet(r.date)).sort((a, b) => a.date.getTime() - b.date.getTime());
}
