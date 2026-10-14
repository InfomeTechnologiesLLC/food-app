import { calendarToday } from './calendar.js';

// Derive history at read/write time so rollover also works while devices are closed.
export function archiveWorkoutDay<T extends { date: string; timezone?: string | null; status?: string | null; finishedAt?: string | null }>(session: T, now = new Date()): T {
  // Recover legacy discarded sessions so users can resume today's workout.
  if (session.status === 'discarded') session = { ...session, status: 'in_progress', finishedAt: null };
  const ended = session.date < calendarToday(session.timezone || 'UTC', now);
  if (ended && session.status === 'in_progress') return { ...session, status: 'finished', finishedAt: now.toISOString() };
  if (!ended && session.status === 'finished') return { ...session, status: 'in_progress', finishedAt: null };
  return session;
}
