import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ChipGroup, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ACTIVITY_OPTIONS, type ActivityOption } from '@/lib/measurements';
import type { BodyMeasurements, Sex } from '@/lib/types';

export interface ProfileDraft { sex: Sex | null; birthYear: string; activityLevel: ActivityOption | null; goalWeeks: string }

export const profileDraft = (body: BodyMeasurements): ProfileDraft => ({
  sex: body.sex ?? null,
  birthYear: body.birthYear?.toString() ?? '',
  activityLevel: body.activityLevel ?? null,
  goalWeeks: body.goalWeeks?.toString() ?? '',
});

const SEX_OPTIONS: readonly (Sex | null)[] = ['male', 'female'];
const ACTIVITY_KEYS: readonly (ActivityOption | null)[] = ACTIVITY_OPTIONS.map(([key]) => key);

/** Sex, birth year, activity level and timeframe: what the app needs to work out daily targets. */
/** `showTimeline`: also ask how many weeks to reach the target (not during sign-up, where the target is set for the user). */
export function ProfileInputs({ value, onChange, showTimeline = true }: { value: ProfileDraft; onChange: (next: ProfileDraft) => void; showTimeline?: boolean }) {
  const set = <K extends keyof ProfileDraft>(key: K, v: ProfileDraft[K]) => onChange({ ...value, [key]: v });
  const activity = ACTIVITY_OPTIONS.find(([key]) => key === value.activityLevel);
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold">Sex (for calorie needs)</ThemedText>
      <ChipGroup options={SEX_OPTIONS} value={value.sex} onChange={(v) => set('sex', v)} format={(s) => (s === 'male' ? 'Male' : 'Female')} />
      <Input label="Birth year" accessibilityLabel="Birth year" placeholder="e.g. 1995" keyboardType="number-pad" value={value.birthYear} onChangeText={(v) => set('birthYear', v)} maxLength={4} />
      <ThemedText type="smallBold">Activity level</ThemedText>
      <ChipGroup options={ACTIVITY_KEYS} value={value.activityLevel} onChange={(v) => set('activityLevel', v)} format={(k) => ACTIVITY_OPTIONS.find(([key]) => key === k)?.[1] ?? ''} />
      {activity && <ThemedText type="small" themeColor="textSecondary">{activity[2]}</ThemedText>}
      {showTimeline && <>
        <Input label="Reach my target weight in (weeks, optional)" accessibilityLabel="Weeks to reach target weight" placeholder="e.g. 20" keyboardType="number-pad" value={value.goalWeeks} onChangeText={(v) => set('goalWeeks', v)} maxLength={3} />
        <ThemedText type="small" themeColor="textSecondary">If that would be too fast to be healthy, we will show you a safe timeline instead.</ThemedText>
      </>}
    </View>
  );
}
