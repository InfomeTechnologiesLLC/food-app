import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { localDate, timezone } from '@/lib/plans';
/** Refresh calendar-sensitive screens at midnight and when returning to the app. */
export function useCalendarDate() {
  const qc = useQueryClient();
  const [calendar, setCalendar] = useState(() => ({ date: localDate(), timezone: timezone() }));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setCalendar({ date: localDate(), timezone: timezone() });
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['food-history'] });
      schedule();
    };
    const schedule = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    };
    schedule();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [qc]);
  return calendar.date;
}
