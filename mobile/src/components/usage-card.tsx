import { StyleSheet, View } from 'react-native';

import { ProgressRing } from '@/components/progress-ring';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { User } from '@/lib/types';

function UsageStat({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const theme = useTheme();
  const pct = limit ? used / limit : 1;
  return (
    <View style={styles.stat}>
      <ProgressRing progress={pct} label={String(used)} color={limit && pct >= 1 ? theme.danger : theme.tint} />
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: 700 }}>{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 13 }}>
          {limit === null ? 'Unlimited' : `${used} of ${limit} used`}
        </ThemedText>
      </View>
    </View>
  );
}

/** This month's scan and meal-plan usage as two ring meters. */
export function UsageCard({ user }: { user: User }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <UsageStat label="Scans" used={user.usage.scansThisMonth} limit={user.limits.scansPerMonth} />
      <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />
      <UsageStat label="Plans" used={user.usage.plansThisMonth} limit={user.limits.plansPerMonth} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: 20 },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
});
