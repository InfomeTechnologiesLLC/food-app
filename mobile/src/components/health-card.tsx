import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { WeightSheet } from '@/components/weight-sheet';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Level, Tip } from '@/lib/coach';
import { useCoach } from '@/lib/use-coach';

const LEVELS: Record<Level, { icon: React.ComponentProps<typeof Ionicons>['name']; color: 'tint' | 'warning' | 'danger' | 'textSecondary' }> = {
  great: { icon: 'checkmark-circle', color: 'tint' },
  good: { icon: 'checkmark-circle', color: 'tint' },
  okay: { icon: 'alert-circle-outline', color: 'warning' },
  attention: { icon: 'warning-outline', color: 'danger' },
  start: { icon: 'flag-outline', color: 'textSecondary' },
};

/** "How am I doing, and what should I do next?" Used in full on Progress and compact on Today. */
export function HealthCard({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  const { coach, series, loading } = useCoach();
  const [logging, setLogging] = useState(false);
  if (!coach) return null;

  const level = LEVELS[coach.level];
  const w = coach.weight;
  const tips = compact ? coach.tips.slice(0, 2) : coach.tips;
  const act = (tip: Tip) => (tip.id === 'weigh-in' || !tip.href ? setLogging(true) : router.push(tip.href as Href));
  const trend = w.perWeek === null ? '–' : `${w.perWeek > 0 ? '+' : '−'}${Math.abs(w.perWeek).toFixed(1)} kg/wk`;
  const recent = series.slice(-10);
  const min = Math.min(...recent.map((p) => p.weightKg));
  const max = Math.max(...recent.map((p) => p.weightKg));

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.row}>
        <Ionicons name={level.icon} size={26} color={theme[level.color]} />
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontSize: 18, fontWeight: 700 }}>{coach.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{coach.detail}</ThemedText>
        </View>
        {loading && <ActivityIndicator color={theme.tint} />}
      </View>

      <View style={styles.stats}>
        <Stat label="Weight" value={w.current === null ? '–' : `${w.current} kg`} />
        <Stat label={w.bmiLabel ?? 'BMI'} value={w.bmi === null ? '–' : `BMI ${w.bmi.toFixed(1)}`} />
        <Stat label="Trend" value={trend} />
      </View>
      {w.target !== null && w.toTarget !== null && (
        <ThemedText type="small" themeColor="textSecondary">
          {Math.abs(w.toTarget) <= 0.5 ? `You are at your ${w.target} kg target.` : `Target ${w.target} kg · ${Math.abs(w.toTarget).toFixed(1)} kg to ${w.toTarget < 0 ? 'lose' : 'gain'}${w.etaWeeks ? ` · about ${w.etaWeeks} ${w.etaWeeks === 1 ? 'week' : 'weeks'} at this pace` : ''}`}
        </ThemedText>
      )}
      {!compact && recent.length >= 2 && (
        <View accessibilityLabel={`Weight over your last ${recent.length} weigh-ins, from ${recent[0]!.weightKg} to ${recent[recent.length - 1]!.weightKg} kilograms`} style={styles.spark}>
          {recent.map((p) => (
            <View key={p.date} style={[styles.bar, { height: 8 + ((p.weightKg - min) / (max - min || 1)) * 32, backgroundColor: theme.tint }]} />
          ))}
        </View>
      )}

      <View style={{ gap: Spacing.two }}>
        <ThemedText type="smallBold">What to do next</ThemedText>
        {!loading && tips.map((tip) => (
          <View key={tip.id} style={styles.tip}>
            <Ionicons name={tip.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={theme.tint} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText type="small">{tip.text}</ThemedText>
              {tip.cta && (
                <Pressable accessibilityRole="button" onPress={() => act(tip)} hitSlop={8}>
                  <ThemedText type="smallBold" themeColor="tint">{tip.cta}</ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </View>

      {compact ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} hitSlop={8}>
          <ThemedText type="smallBold" themeColor="tint">See full progress</ThemedText>
        </Pressable>
      ) : (
        <>
          <Button title="Log weight" variant="secondary" onPress={() => setLogging(true)} />
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>General guidance based on your logs, not medical advice.</ThemedText>
        </>
      )}
      <WeightSheet visible={logging} onClose={() => setLogging(false)} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <ThemedText style={{ fontSize: 17, fontWeight: 700 }} numberOfLines={1}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }} numberOfLines={1}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.three, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stats: { flexDirection: 'row', gap: Spacing.two },
  tip: { flexDirection: 'row', gap: Spacing.two },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 40 },
  bar: { flex: 1, borderRadius: 3 },
});
