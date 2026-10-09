/**
 * Pure scheduling logic for expiry reminders (no React Native imports, so it's easy to test).
 * One digest per day at the chosen hour, listing what expires that day and the next.
 */
export interface ExpiringItem {
  name: string;
  expiryDate?: string | null;
}

export interface PlannedReminder {
  date: Date;
  title: string;
  body: string;
}

const LOOKAHEAD_DAYS = 14;
const MAX_REMINDERS = 20;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (d: Date) => startOfDay(d).getTime();

const list = (names: string[]) =>
  names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;

export function planReminders(items: ExpiringItem[], hour: number, now = new Date()): PlannedReminder[] {
  const byDay = new Map<number, string[]>();
  for (const item of items) {
    if (!item.expiryDate) continue;
    const key = dayKey(new Date(item.expiryDate));
    byDay.set(key, [...(byDay.get(key) ?? []), item.name]);
  }

  const reminders: PlannedReminder[] = [];
  const today = startOfDay(now);

  for (let offset = 0; offset < LOOKAHEAD_DAYS && reminders.length < MAX_REMINDERS; offset++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const fireAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
    if (fireAt <= now) continue;

    const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const todayItems = byDay.get(dayKey(day)) ?? [];
    const tomorrowItems = byDay.get(dayKey(nextDay)) ?? [];
    const total = todayItems.length + tomorrowItems.length;
    if (total === 0) continue;

    const title =
      total === 1
        ? `${capitalize(todayItems[0] ?? tomorrowItems[0])} expires ${todayItems.length ? 'today' : 'tomorrow'}`
        : `${total} items to use soon`;
    const parts = [
      todayItems.length && `Today: ${list(todayItems)}.`,
      tomorrowItems.length && `Tomorrow: ${list(tomorrowItems)}.`,
    ].filter(Boolean);

    reminders.push({ date: fireAt, title, body: `${total === 1 ? '' : parts.join(' ') + ' '}Tap to see your pantry.`.trim() });
  }
  return reminders;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
