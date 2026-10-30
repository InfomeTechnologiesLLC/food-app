import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, Pressable } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateLabel } from '@/lib/plans';
import { untilText, usePeriod, usePeriodActions, type Pain } from '@/lib/period';

const PAIN: { value: Pain; label: string }[] = [
  { value: 'none', label: 'No pain' },
  { value: 'mild', label: 'Mild' },
  { value: 'strong', label: 'Strong' },
];
/** Shown this many days before the expected start */
const SOON_DAYS = 3;

/**
 * Period card on Today, for female users who track their period. On period days it asks about pain
 * and shows comfort foods; a few days before, it says when the period is expected.
 */
export function PeriodCard({ date }: { date: string }) {
  const theme = useTheme();
  const period = usePeriod(date);
  const actions = usePeriodActions(date);
  const p = period.data;
  if (!p?.available || !p.settings.tracking) return null;
  const { status } = p;
  const soon = !status.onPeriod && status.daysUntilNext !== null && status.daysUntilNext <= SOON_DAYS;
  if (!status.onPeriod && !soon) return null;
  const fail = (e: Error) => showAlert('Couldn’t save', e.message);
  const accent = theme.period;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <ThemedText style={{ fontSize: 20, fontWeight: 700 }}>{status.onPeriod ? `Period · day ${status.dayOfPeriod}` : 'Period expected'}</ThemedText>
        <Ionicons name="flower" size={20} color={accent} />
      </View>

      {status.onPeriod ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {p.settings.exercise === 'rest' ? 'Today is a rest day. Your workout won’t count as missed.' : 'Light exercise only today: a walk or gentle stretches.'}
          </ThemedText>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold">How is your pain today?</ThemedText>
            <View style={styles.row}>
              {PAIN.map((o) => {
                const selected = p.pain === o.value;
                return (
                  <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected }} disabled={actions.pain.isPending}
                    onPress={() => actions.pain.mutate(o.value, { onError: fail })}
                    style={({ pressed }) => [styles.option, { backgroundColor: selected ? accent : theme.background, borderColor: selected ? accent : theme.border, opacity: pressed ? 0.8 : 1 }]}>
                    <ThemedText type="smallBold" style={{ color: selected ? '#ffffff' : theme.text }}>{o.label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {p.pain && p.pain !== 'none' && (
            <View style={[styles.panel, { backgroundColor: theme.background }]}>
              <ThemedText type="smallBold">{p.pain === 'strong' ? 'Go easy today' : 'Things that may help'}</ThemedText>
              {[...p.comfort.mine.map((f) => ({ f, mine: true })), ...p.comfort.general.map((f) => ({ f, mine: false }))].map(({ f, mine }) => (
                <View key={f} style={styles.line}>
                  <Ionicons name={mine ? 'heart' : 'leaf-outline'} size={14} color={accent} style={{ marginTop: 3 }} />
                  <ThemedText type="small" style={{ flex: 1 }}>{f}{mine ? ' (your favourite)' : ''}</ThemedText>
                </View>
              ))}
              {p.pain === 'strong' && (
                <ThemedText type="small" themeColor="warning">A heat pad and rest can help. If the pain is severe, unusual or doesn’t ease, please see a doctor.</ThemedText>
              )}
            </View>
          )}
          {!status.current?.endDate && (
            <Pressable accessibilityRole="button" disabled={actions.update.isPending}
              onPress={() => status.current && actions.update.mutate({ id: status.current._id, startDate: status.current.startDate, endDate: date }, { onError: fail })}
              style={styles.inline} hitSlop={8}>
              <Ionicons name="checkmark-done" size={16} color={theme.tint} />
              <ThemedText type="smallBold" themeColor="tint">My period ended today</ThemedText>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Your next period is expected {untilText(status.daysUntilNext!)} ({dateLabel(status.nextStart!)}). Keep a few comfort foods at hand.
          </ThemedText>
          <Pressable accessibilityRole="button" disabled={actions.log.isPending} onPress={() => actions.log.mutate({ startDate: date }, { onError: fail })}
            style={({ pressed }) => [styles.solid, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}>
            <Ionicons name="add" size={18} color="#ffffff" />
            <ThemedText style={{ color: '#ffffff', fontWeight: 700 }}>It started today</ThemedText>
          </Pressable>
        </>
      )}
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>General guidance, not medical advice.</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.three, borderWidth: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  option: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  line: { flexDirection: 'row', gap: Spacing.two },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  solid: { height: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
