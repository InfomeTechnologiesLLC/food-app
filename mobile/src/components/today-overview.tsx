import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { WeightSheet } from '@/components/weight-sheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Level, Tip } from '@/lib/coach';
import { useCoach } from '@/lib/use-coach';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const LEVEL: Record<Level, { color: 'tint' | 'warning' | 'danger' | 'textSecondary'; label: string }> = {
  great: { color: 'tint', label: 'On track' },
  good: { color: 'tint', label: 'On track' },
  okay: { color: 'warning', label: 'Mostly on track' },
  attention: { color: 'danger', label: 'Needs attention' },
  start: { color: 'textSecondary', label: 'Getting started' },
};

/**
 * Weight, trend, today's meals and today's workout as four value tiles. Tapping a tile opens the
 * related screen; "Next steps" shows the coach's tips only when the user asks for them.
 */
export function TodayOverview() {
  const theme = useTheme();
  const { coach, loading, progress } = useCoach();
  const [tipsOpen, setTipsOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  if (!coach) return null;

  const w = coach.weight;
  const food = progress.food.days[0];
  const workout = progress.exercise.days[0];
  const level = LEVEL[coach.level];
  const trend = w.perWeek === null ? '–' : `${w.perWeek > 0.05 ? '+' : w.perWeek < -0.05 ? '−' : ''}${Math.abs(w.perWeek).toFixed(1)}`;
  const workoutValue = !progress.exercise.enabled ? 'Off'
    : workout?.done ? 'Done'
      : workout?.planned ? 'To do'
        : 'Rest';

  const tiles: { icon: IconName; label: string; value: string; sub: string; onPress: () => void }[] = [
    {
      icon: 'scale-outline', label: 'Weight', value: w.current === null ? '–' : `${w.current} kg`,
      sub: w.target !== null && w.toTarget !== null ? (Math.abs(w.toTarget) <= 0.5 ? 'At target' : `${Math.abs(w.toTarget).toFixed(1)} kg to ${w.toTarget < 0 ? 'lose' : 'gain'}`) : 'Tap to log',
      onPress: () => setLogging(true),
    },
    {
      icon: 'trending-up-outline', label: 'Trend', value: w.perWeek === null ? '–' : `${trend} kg`,
      sub: w.perWeek === null ? 'Needs 1 week' : 'per week', onPress: () => router.push('/progress'),
    },
    {
      icon: 'restaurant-outline', label: 'Meals today', value: food?.planned ? `${food.done} / ${food.planned}` : `${food?.done ?? 0}`,
      sub: food?.planned ? 'eaten' : 'logged', onPress: () => router.navigate('/plans'),
    },
    {
      icon: 'barbell-outline', label: 'Workout', value: workoutValue,
      sub: workout?.sets ? `${workout.sets} sets` : !progress.exercise.enabled ? 'Tap to set up' : workout?.planned ? 'planned today' : 'no workout today',
      onPress: () => router.navigate(progress.exercise.enabled ? '/exercise' : '/training-settings'),
    },
  ];
  // Green hero card: everything on it uses the tint's text colour, with see-through layers for tiles
  const on = theme.tintText;
  const soft = `${on}CC`;
  const layer = `${on}24`;
  const act = (tip: Tip) => (tip.id === 'weigh-in' || !tip.href ? setLogging(true) : router.push(tip.href as Href));

  return (
    <View style={[styles.card, { backgroundColor: theme.tint }]}>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <ThemedText style={[styles.eyebrow, { color: soft }]}>YOUR PROGRESS</ThemedText>
          <ThemedText style={{ fontSize: 22, lineHeight: 28, fontWeight: 700, color: on }}>{level.label}</ThemedText>
        </View>
        <View style={[styles.icon, { backgroundColor: layer }]}>
          <Ionicons name="trending-up" size={22} color={on} />
        </View>
      </View>

      <View style={styles.grid}>
        {tiles.map((t) => (
          <Pressable key={t.label} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.value}, ${t.sub}`} onPress={t.onPress}
            style={({ pressed }) => [styles.tile, { backgroundColor: layer, opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.tileTop}>
              <ThemedText type="small" style={{ fontSize: 12, color: soft }}>{t.label}</ThemedText>
              <Ionicons name={t.icon} size={16} color={on} />
            </View>
            <ThemedText style={[styles.value, { color: on }]} numberOfLines={1}>{t.value}</ThemedText>
            <ThemedText type="small" style={{ fontSize: 12, color: soft }} numberOfLines={1}>{t.sub}</ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={() => setTipsOpen((v) => !v)} hitSlop={8} style={styles.inline}>
          <Ionicons name="bulb-outline" size={16} color={on} />
          <ThemedText type="smallBold" style={{ color: on }}>{tipsOpen ? 'Hide next steps' : `Next steps (${coach.tips.length})`}</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} hitSlop={8} style={styles.inline}>
          <ThemedText type="smallBold" style={{ color: on }}>Full progress</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={on} />
        </Pressable>
      </View>
      {tipsOpen && (loading ? <ActivityIndicator color={on} /> : (
        <View style={{ gap: Spacing.two }}>
          {coach.tips.map((tip) => (
            <Pressable key={tip.id} accessibilityRole="button" onPress={() => act(tip)} style={[styles.tip, { backgroundColor: layer }]}>
              <Ionicons name={tip.icon as IconName} size={18} color={on} style={{ marginTop: 1 }} />
              <ThemedText type="small" style={{ flex: 1, color: on }}>{tip.text}</ThemedText>
              {tip.cta && <ThemedText type="smallBold" style={{ color: on, textDecorationLine: 'underline' }}>{tip.cta}</ThemedText>}
            </Pressable>
          ))}
        </View>
      ))}
      <WeightSheet visible={logging} onClose={() => setLogging(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.three },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: 600, letterSpacing: 1.2 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: 14, padding: Spacing.two, gap: 2 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { fontSize: 22, lineHeight: 28, fontWeight: 700 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, padding: Spacing.two, borderRadius: 12 },
});
