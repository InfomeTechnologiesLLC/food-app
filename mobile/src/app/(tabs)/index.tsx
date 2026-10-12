import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { daysUntil, usePantry } from '@/lib/pantry';
import { activePlan, planDayDate, today, usePlans } from '@/lib/plans';
import type { PantryItem } from '@/lib/types';
import { formatQty } from '@/lib/quantities';
import { remaining } from '@/lib/usage';

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`;

/** Days of the plan from today through its last day. */
function daysAhead(startDate: string | undefined, dayCount: number) {
  if (!startDate) return 0;
  const last = planDayDate(startDate, dayCount).getTime();
  return Math.max(0, Math.round((last - today().getTime()) / 86_400_000) + 1);
}

function StatTile({ value, label, icon, iconColor, href }: {
  value: number | string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  href: Href;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.navigate(href)}
      style={({ pressed }) => [styles.tile, styles.statTile, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.rowBetween}>
        <ThemedText style={styles.statValue}>{value}</ThemedText>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{label}</ThemedText>
    </Pressable>
  );
}

function freshLabel(days: number) {
  if (days < 0) return 'Expired';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function FreshRow({ item, last }: { item: PantryItem; last: boolean }) {
  const theme = useTheme();
  const days = daysUntil(item.expiryDate!);
  const color = days <= 0 ? theme.danger : theme.warning;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/pantry-item', params: { id: item._id } })}
      style={({ pressed }) => [
        styles.rowBetween,
        { alignItems: 'center', paddingVertical: Spacing.three, opacity: pressed ? 0.7 : 1 },
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={{ fontWeight: 600 }}>{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
          {formatQty(item.quantity, item.unit)} · {humanize(item.category)}
        </ThemedText>
      </View>
      <View style={[styles.pill, { backgroundColor: `${color}22` }]}>
        <ThemedText type="small" style={{ fontSize: 12, color }}>{freshLabel(days)}</ThemedText>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { data: items = [], isLoading, refetch, isRefetching } = usePantry();
  const { data: plans = [], refetch: refetchPlans } = usePlans();
  const latest = activePlan(plans);
  const scansLeft = remaining(user, 'scans');
  const expiringSoon = items.filter((i) => i.expiryDate && daysUntil(i.expiryDate) <= 3);
  const freshness = [...expiringSoon].sort((a, b) => daysUntil(a.expiryDate!) - daysUntil(b.expiryDate!));
  const ahead = latest ? daysAhead(latest.startDate, latest.dayCount) : 0;
  const toBuy = latest ? latest.shoppingTotal - latest.shoppingChecked : 0;
  const progress = latest && latest.totalMeals > 0 ? latest.readyMeals / latest.totalMeals : 0;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen edges={['bottom']} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); refetchPlans(); }} />}>
      <View style={{ gap: Spacing.one, paddingTop: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary">{dateLabel}</ThemedText>
        <ThemedText type="subtitle">
          {"What’s "}<ThemedText type="subtitle" themeColor="tint">cooking?</ThemedText>
        </ThemedText>
      </View>

      <View style={[styles.row, { gap: Spacing.two, alignItems: 'stretch' }]}>
        <Pressable
          onPress={() => router.navigate('/pantry')}
          style={({ pressed }) => [styles.tile, styles.heroTile, { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 }]}>
          <View style={styles.rowBetween}>
            <ThemedText style={[styles.eyebrow, { color: theme.tintText }]}>YOUR PANTRY</ThemedText>
            <Ionicons name="basket-outline" size={20} color={theme.tintText} />
          </View>
          <ThemedText style={[styles.heroValue, { color: theme.tintText }]}>{isLoading ? '–' : items.length}</ThemedText>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="small" style={{ color: theme.tintText }}>{plural(items.length, 'item')} tracked</ThemedText>
            <Ionicons style={{ alignSelf: 'flex-end' }} name="arrow-forward" size={22} color={theme.tintText} />
          </View>
        </Pressable>

        <View style={{ flex: 1, gap: Spacing.two }}>
          <StatTile
            value={expiringSoon.length}
            label={`${plural(expiringSoon.length, 'Item')} to use soon`}
            icon="time-outline"
            iconColor={theme.warning}
            href="/pantry"
          />
          <StatTile
            value={ahead}
            label={`${plural(ahead, 'Day')} planned ahead`}
            icon="restaurant-outline"
            iconColor={theme.textSecondary}
            href="/plans"
          />
        </View>
      </View>

      <View style={{ gap: Spacing.two }}>
        <View style={[styles.row, { gap: Spacing.two }]}>
          <Pressable
            onPress={() => router.navigate('/scan')}
            style={({ pressed }) => [styles.action, { flex: 1, gap: Spacing.two, backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 }]}>
            <Ionicons name="scan-outline" size={20} color={theme.tintText} />
            <ThemedText style={{ color: theme.tintText, fontWeight: 600 }}>Scan groceries or receipt</ThemedText>
          </Pressable>
          <Pressable
            accessibilityLabel="Add item manually"
            onPress={() => router.push('/pantry-item')}
            style={({ pressed }) => [styles.action, { width: 50, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 }]}>
            <Ionicons name="add" size={26} color={theme.text} />
          </Pressable>
        </View>
        {scansLeft !== null && (
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
            {scansLeft} free {plural(scansLeft, 'scan')} left this month
          </ThemedText>
        )}
      </View>

      <Pressable
        onPress={() => (latest ? router.push({ pathname: '/plan/[id]', params: { id: latest._id } }) : router.navigate('/plans'))}
        style={({ pressed }) => [styles.tile, { gap: Spacing.three, marginTop: Spacing.three, backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1, opacity: pressed ? 0.85 : 1 }]}>
        <View style={{ gap: Spacing.two }}>
          <ThemedText style={[styles.eyebrow, { color: theme.textSecondary }]}>
            {latest ? `${latest.dayCount}-DAY MEAL PLAN` : 'MEAL PLAN'}
          </ThemedText>
          <ThemedText style={{ fontSize: 22, lineHeight: 28, fontWeight: 600 }}>
            {latest ? latest.title : 'Plan your meals'}
          </ThemedText>
        </View>

        {latest ? (
          <View style={{ gap: Spacing.two }}>
            <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
              <View style={[styles.track, { width: `${progress * 100}%`, backgroundColor: theme.tint }]} />
            </View>
            <View style={styles.rowBetween}>
              <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                {latest.readyMeals} / {latest.totalMeals} meals ready
              </ThemedText>
              <ThemedText type="small" style={{ fontSize: 12, color: theme.warning }}>
                {toBuy} {plural(toBuy, 'item')} to buy
              </ThemedText>
            </View>
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">Turn your pantry into a 1–7 day plan.</ThemedText>
        )}

        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: Spacing.three }}>
          <Ionicons style={{ alignSelf: 'flex-end' }} name="arrow-forward" size={22} color={theme.tint} />
        </View>
      </Pressable>

      {freshness.length > 0 && (
        <View style={{ marginTop: Spacing.two }}>
          <View style={[styles.rowBetween, { alignItems: 'center', marginBottom: Spacing.one }]}>
            <ThemedText style={{ fontSize: 17, fontWeight: 700 }}>Freshness check</ThemedText>
            <Pressable onPress={() => router.navigate('/pantry')} hitSlop={8} style={[styles.row, { gap: Spacing.one }]}>
              <ThemedText type="small" themeColor="tint">View pantry</ThemedText>
              <Ionicons name="chevron-forward" size={16} color={theme.tint} />
            </Pressable>
          </View>
          {freshness.map((item, i) => (
            <FreshRow key={item._id} item={item} last={i === freshness.length - 1} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tile: { borderRadius: 20, padding: Spacing.three },
  heroTile: { flex: 1, justifyContent: 'space-between', minHeight: 176 },
  statTile: { flex: 1, borderWidth: 1, justifyContent: 'space-between', gap: Spacing.two },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: 700 },
  heroValue: { fontSize: 56, lineHeight: 64, fontWeight: 700 },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: 600, letterSpacing: 1.2 },
  action: { height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
});
