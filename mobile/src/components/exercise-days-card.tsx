import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button, ChipGroup } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { DEFAULT_TRAINING } from '@/lib/exercise-types';

/** Sunday = 0, as in JavaScript dates. Shown Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRESETS: { label: string; days: number[] }[] = [
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Alternate days', days: [1, 3, 5] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Weekends', days: [0, 6] },
];
const MINUTES = [15, 20, 30, 45, 60] as const;
const same = (a: number[], b: number[]) => a.length === b.length && a.every((d) => b.includes(d));

/**
 * "Which days do you want to exercise?" Asked before the first workout week is planned, so the week
 * follows the user's own days (every day, alternate days, weekdays or any days they pick).
 */
export function ExerciseDaysCard({ goal, onSaved }: { goal: 'muscle_gain' | 'general_fitness'; onSaved: () => void }) {
  const theme = useTheme();
  const { user, updateTraining } = useAuth();
  const current = user?.training ?? DEFAULT_TRAINING;
  const [days, setDays] = useState<number[]>(user?.trainingDaysChosen ? current.weekdays : []);
  const [minutes, setMinutes] = useState<(typeof MINUTES)[number]>((MINUTES as readonly number[]).includes(current.sessionMinutes) ? current.sessionMinutes as (typeof MINUTES)[number] : 30);
  const [saving, setSaving] = useState(false);
  const toggle = (d: number) => setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]));

  const save = async () => {
    setSaving(true);
    try {
      await updateTraining({ ...DEFAULT_TRAINING, ...current, enabled: true, weekdays: [...days].sort(), sessionMinutes: minutes, goal: current.enabled ? current.goal : goal });
      onSaved();
    } catch (e) {
      showAlert('Couldn’t save', (e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={{ gap: 4 }}>
        <ThemedText style={{ fontSize: 20, fontWeight: 700 }}>Which days do you want to exercise?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Your coach plans workouts only on these days. You can change them any time in Profile → Exercise preferences.</ThemedText>
      </View>
      <View style={styles.wrap}>
        {PRESETS.map((p) => {
          const selected = same(days, p.days);
          return (
            <Pressable key={p.label} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setDays(p.days)}
              style={[styles.preset, { backgroundColor: selected ? theme.tint : theme.background, borderColor: selected ? theme.tint : theme.border }]}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.tintText : theme.text }}>{p.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.week}>
        {WEEK.map((d) => {
          const on = days.includes(d);
          return (
            <Pressable key={d} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={NAMES[d]} onPress={() => toggle(d)}
              style={[styles.day, { backgroundColor: on ? theme.tint : theme.background, borderColor: on ? theme.tint : theme.border }]}>
              <ThemedText type="smallBold" style={{ color: on ? theme.tintText : theme.text, fontSize: 13 }}>{NAMES[d]}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="smallBold">How long each time?</ThemedText>
        <ChipGroup options={MINUTES} value={minutes} onChange={setMinutes} format={(m) => `${m} min`} />
      </View>
      <Button title={days.length ? `Plan ${days.length} ${days.length === 1 ? 'day' : 'days'} a week` : 'Pick at least one day'} icon="sparkles-outline" onPress={() => void save()} loading={saving} disabled={!days.length} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: 20, gap: Spacing.three },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  preset: { height: 38, paddingHorizontal: Spacing.three, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
