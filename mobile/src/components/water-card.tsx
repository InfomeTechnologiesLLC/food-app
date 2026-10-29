import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { waterExpectedMl } from '@/lib/activity-reminders';
import { useReminderSettings } from '@/lib/reminders';
import { GLASS_ML, litres, useWater, useWaterActions } from '@/lib/water';

const AMOUNTS = [[GLASS_ML, 'Glass'], [500, 'Bottle']] as const;

/** Today's water: progress toward the goal, one-tap logging and undo. */
export function WaterCard({ date }: { date: string }) {
  const theme = useTheme();
  const water = useWater(date);
  const { add, undo } = useWaterActions(date);
  const settings = useReminderSettings();
  const day = water.data;
  const busy = add.isPending || undo.isPending;
  const fail = (e: Error) => showAlert('Couldn’t save', e.message);

  let status = '';
  if (day) {
    const left = day.goalMl - day.totalMl;
    const expected = waterExpectedMl(day.goalMl, new Date(), settings?.waterStartHour ?? 8, settings?.waterEndHour ?? 20);
    status = left <= 0 ? 'Goal reached. Nicely done!'
      : expected - day.totalMl > GLASS_ML ? `You are a bit behind. Have a glass now (${Math.ceil(left / GLASS_ML)} to go).`
        : `${Math.ceil(left / GLASS_ML)} more ${Math.ceil(left / GLASS_ML) === 1 ? 'glass' : 'glasses'} to go today.`;
  }
  const percent = day ? Math.min(100, Math.round((day.totalMl / day.goalMl) * 100)) : 0;
  const last = day?.entries.at(-1);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <ThemedText style={{ fontSize: 20, fontWeight: 700 }}>Water</ThemedText>
        <Ionicons name="water" size={20} color={theme.water} />
      </View>
      {water.isLoading ? <ActivityIndicator color={theme.water} /> : !day ? (
        <Pressable accessibilityRole="button" onPress={() => void water.refetch()} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">Couldn’t load today’s water. <ThemedText type="small" themeColor="tint">Try again</ThemedText></ThemedText>
        </Pressable>
      ) : (
        <>
          <View style={styles.rowBetween}>
            <ThemedText style={{ fontSize: 28, lineHeight: 34, fontWeight: 700 }}>
              {litres(day.totalMl)} <ThemedText themeColor="textSecondary">/ {litres(day.goalMl)}</ThemedText>
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{percent}%</ThemedText>
          </View>
          <View accessibilityRole="progressbar" accessibilityLabel="Water today" accessibilityValue={{ min: 0, max: day.goalMl, now: Math.min(day.totalMl, day.goalMl) }}
            style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.water }]} />
          </View>
          <ThemedText type="small" themeColor={status.startsWith('You are a bit behind') ? 'warning' : 'textSecondary'}>{status}</ThemedText>
          <View style={styles.buttons}>
            {AMOUNTS.map(([ml, label]) => (
              <Pressable key={ml} accessibilityRole="button" accessibilityLabel={`Add ${ml} millilitres`} disabled={busy} onPress={() => add.mutate(ml, { onError: fail })}
                style={({ pressed }) => [styles.add, { backgroundColor: theme.water, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}>
                <Ionicons name="add" size={18} color="#ffffff" />
                <ThemedText style={{ color: '#ffffff', fontWeight: 700 }}>{label} {ml} ml</ThemedText>
              </Pressable>
            ))}
            {last && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Undo the last ${last.amountMl} millilitres`} disabled={busy} onPress={() => undo.mutate(last._id, { onError: fail })}
                style={({ pressed }) => [styles.undo, { borderColor: theme.border, opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
                <Ionicons name="arrow-undo-outline" size={18} color={theme.text} />
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two, borderWidth: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  buttons: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  add: { flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  undo: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
