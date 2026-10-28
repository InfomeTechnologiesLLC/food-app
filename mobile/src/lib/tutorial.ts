import { useEffect } from 'react';
import { router } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { readLocal, writeLocal } from '@/lib/local-store';

const KEY = 'tutorial-seen';

/** Remembered on this device, per account. */
export const hasSeenTutorial = (userId: string) => readLocal<boolean>(userId, KEY) === true;
export const markTutorialSeen = (userId: string) => writeLocal(userId, KEY, true);

/** Opens the tutorial once for an account that has finished onboarding. Mount in the tabs layout. */
export function useFirstLoginTutorial() {
  const { user } = useAuth();
  const id = user?.onboarded ? user._id : null;
  useEffect(() => {
    if (id && !hasSeenTutorial(id)) router.push('/tutorial');
  }, [id]);
}
