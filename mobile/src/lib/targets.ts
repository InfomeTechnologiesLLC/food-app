import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { DailyTargets } from '@/lib/types';

/** Today's calorie, macro and water targets. Refetched whenever the profile or goal changes. */
export function useTargets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['targets', user?._id, user?.body, user?.preferences.goal],
    enabled: !!user,
    queryFn: () => api<DailyTargets>('/me/targets'),
  });
}
