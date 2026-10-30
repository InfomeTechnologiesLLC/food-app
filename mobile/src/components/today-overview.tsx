import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { MeasurementsForm } from '@/components/measurements-form';
import { ThemedText } from '@/components/themed-text';
import { WeightSheet } from '@/components/weight-sheet';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import type { Tip } from '@/lib/coach';
import { addDaysLocal } from '@/lib/nutrition-coach';
import { dateLabel, localDate } from '@/lib/plans';
import { goalProgress } from '@/lib/progress';
import { useTargets } from '@/lib/targets';
import { useCoach } from '@/lib/use-coach';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const kg = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} kg`;
const signed = (n: number) => `${n > 0.05 ? '+' : n < -0.05 ? '−' : ''}${Math.abs(n).toFixed(1)} kg`;

/**
 * The top of Today: the user's weight goal (lose, gain or keep steady), how far along they are,
 * this week's change against the plan, and the weekly weigh-in. The target weight is set by the
 * app from height, weight and goal, so this card always has a goal to show.
 */
export function TodayOverview() {
  const theme = useTheme();
  const { user, refreshUser } = useAuth();
  const { coach, series } = useCoach();
  const targets = useTargets();
  const [tipsOpen, setTipsOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);

  // The server fills in a suggested target weight when it works out the targets; pick it up once
  const refreshed = useRef(false);
  const body = user?.body;
  const needsTarget = !!body?.heightCm && !!body.weightKg && body.targetWeightKg == null;
  useEffect(() => {
    if (needsTarget && targets.isSuccess && !refreshed.current) { refreshed.current = true; void refreshUser(); }
  }, [needsTarget, targets.isSuccess, refreshUser]);

  if (!user || !coach) return null;
  // Everything on the green card uses the tint's text colour, with see-through layers for panels
  const on = theme.tintText;
  const soft = `${on}CC`;
  const layer = `${on}24`;
  const t = targets.data?.ready ? targets.data : null;
  const w = coach.weight;
  const goal = goalProgress(series, user.body.targetWeightKg);
  const today = localDate();
  const lastWeighIn = series.at(-1)?.date ?? null;
  const weighInDue = !lastWeighIn || lastWeighIn <= addDaysLocal(today, -7);
  const act = (tip: Tip) => (tip.id === 'weigh-in' || !tip.href ? setLogging(true) : router.push(tip.href as Href));

  const sheets = (
    <>
      <WeightSheet visible={logging} onClose={() => setLogging(false)} />
      <BottomSheet visible={editing} title="Body and goal" onClose={() => setEditing(false)}>
        {editing && <MeasurementsForm initial={user.body} onSaved={() => setEditing(false)} />}
      </BottomSheet>
    </>
  );

  // No height or weight yet: one clear step
  if (w.current === null || !user.body.heightCm) {
    return (
      <View style={[styles.card, { backgroundColor: theme.tint }]}>
        <ThemedText style={[styles.eyebrow, { color: soft }]}>YOUR GOAL</ThemedText>
        <ThemedText style={[styles.headline, { color: on }]}>Let’s set your goal</ThemedText>
        <ThemedText type="small" style={{ color: soft }}>Add your height and weight. Your coach sets a healthy target weight and tracks it every week.</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={({ pressed }) => [styles.solid, { backgroundColor: on, opacity: pressed ? 0.85 : 1 }]}>
          <Ionicons name="body-outline" size={18} color={theme.tint} />
          <ThemedText style={{ color: theme.tint, fontWeight: 700 }}>Add height and weight</ThemedText>
        </Pressable>
        {sheets}
      </View>
    );
  }

  const target = user.body.targetWeightKg ?? null;
  const dir = t?.direction ?? (target === null || Math.abs(target - w.current) <= 0.5 ? 'maintain' : target < w.current ? 'lose' : 'gain');
  const left = target !== null ? Math.abs(target - w.current) : 0;
  const headline = dir === 'maintain' || left <= 0.5 ? `Stay at ${kg(w.current)}` : `${dir === 'lose' ? 'Lose' : 'Gain'} ${kg(Math.round(left * 10) / 10)}`;
  const plannedRate = t && t.weeklyRateKg !== 0 ? `${signed(t.weeklyRateKg)} a week` : 'steady';
  const icon: IconName = dir === 'lose' ? 'trending-down' : dir === 'gain' ? 'trending-up' : 'remove';

  return (
    <View style={[styles.card, { backgroundColor: theme.tint }]}>
      <View style={styles.rowBetween}>
        <View style={{ flexShrink: 1 }}>
          <ThemedText style={[styles.eyebrow, { color: soft }]}>YOUR GOAL</ThemedText>
          <ThemedText style={[styles.headline, { color: on }]}>{headline}</ThemedText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Change goal" onPress={() => setEditing(true)} style={[styles.round, { backgroundColor: layer }]}>
          <Ionicons name={icon} size={22} color={on} />
        </Pressable>
      </View>

      {/* Start → now → target */}
      <View style={{ gap: 6 }}>
        <View style={[styles.track, { backgroundColor: layer }]}>
          <View style={[styles.fill, { width: `${Math.max(4, goal?.percent ?? 0)}%`, backgroundColor: on }]} />
        </View>
        <View style={styles.rowBetween}>
          <ThemedText type="small" style={{ color: soft }}>Now {kg(w.current)}</ThemedText>
          <ThemedText type="small" style={{ color: soft }}>{goal ? `${goal.percent}% there` : ''}</ThemedText>
          <ThemedText type="small" style={{ color: soft }}>Target {target !== null ? kg(target) : '–'}</ThemedText>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: layer }]}>
          <ThemedText type="small" style={{ color: soft, fontSize: 12 }}>This week</ThemedText>
          <ThemedText style={[styles.statValue, { color: on }]}>{w.perWeek === null ? '–' : signed(w.perWeek)}</ThemedText>
          <ThemedText type="small" style={{ color: soft, fontSize: 12 }} numberOfLines={1}>{w.perWeek === null ? 'needs 2 weigh-ins' : `plan ${plannedRate}`}</ThemedText>
        </View>
        <View style={[styles.stat, { backgroundColor: layer }]}>
          <ThemedText type="small" style={{ color: soft, fontSize: 12 }}>Time to goal</ThemedText>
          <ThemedText style={[styles.statValue, { color: on }]}>{dir === 'maintain' ? '–' : t?.timeline ? `${t.timeline.weeks} wk` : '–'}</ThemedText>
          <ThemedText type="small" style={{ color: soft, fontSize: 12 }} numberOfLines={1}>{w.bmi !== null ? `BMI ${w.bmi.toFixed(1)}` : 'at a safe pace'}</ThemedText>
        </View>
      </View>

      {/* Weekly weigh-in: prominent when due, a quiet line otherwise */}
      {weighInDue ? (
        <Pressable accessibilityRole="button" onPress={() => setLogging(true)} style={({ pressed }) => [styles.solid, { backgroundColor: on, opacity: pressed ? 0.85 : 1 }]}>
          <Ionicons name="scale-outline" size={18} color={theme.tint} />
          <ThemedText style={{ color: theme.tint, fontWeight: 700 }}>Weekly weigh-in: log your weight</ThemedText>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setLogging(true)} style={styles.inline} hitSlop={8}>
          <Ionicons name="checkmark-circle" size={16} color={on} />
          <ThemedText type="small" style={{ color: on, flex: 1 }}>Weighed in {lastWeighIn === today ? 'today' : dateLabel(lastWeighIn!)}. Next on {dateLabel(addDaysLocal(lastWeighIn!, 7))}.</ThemedText>
          <ThemedText type="smallBold" style={{ color: on }}>Update</ThemedText>
        </Pressable>
      )}

      <View style={[styles.rowBetween, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: layer, paddingTop: Spacing.two }]}>
        <Pressable accessibilityRole="button" onPress={() => setTipsOpen((v) => !v)} hitSlop={8} style={styles.inline}>
          <Ionicons name="bulb-outline" size={16} color={on} />
          <ThemedText type="smallBold" style={{ color: on }}>{tipsOpen ? 'Hide coach tips' : `Coach tips (${coach.tips.length})`}</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} hitSlop={8} style={styles.inline}>
          <ThemedText type="smallBold" style={{ color: on }}>Full progress</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={on} />
        </Pressable>
      </View>
      {tipsOpen && coach.tips.map((tip) => (
        <Pressable key={tip.id} accessibilityRole="button" onPress={() => act(tip)} style={[styles.tip, { backgroundColor: layer }]}>
          <Ionicons name={tip.icon as IconName} size={18} color={on} style={{ marginTop: 1 }} />
          <ThemedText type="small" style={{ flex: 1, color: on }}>{tip.text}</ThemedText>
          {tip.cta && <ThemedText type="smallBold" style={{ color: on, textDecorationLine: 'underline' }}>{tip.cta}</ThemedText>}
        </Pressable>
      ))}
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: Spacing.three, gap: Spacing.three },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: 700, letterSpacing: 1.2 },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: 800 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: 14, padding: Spacing.two, gap: 2 },
  statValue: { fontSize: 20, lineHeight: 26, fontWeight: 700 },
  solid: { height: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, padding: Spacing.two, borderRadius: 12 },
});
