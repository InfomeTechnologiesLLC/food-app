import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { expiryLabel } from '@/lib/pantry';
import { formatQty } from '@/lib/quantities';
import type { PantryIngredient } from '@/lib/types';

export function PantryRow({ item }: { item: PantryIngredient }) {
  const theme = useTheme();
  const expiry = expiryLabel(item.expiryDate);
  const badgeColor =
    expiry.level === 'danger' ? theme.danger : expiry.level === 'warning' ? theme.warning : theme.textSecondary;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/pantry-ingredient', params: { ingredientId: item._id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      <View style={{ flex: 1, gap: Spacing.one }}>
        <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 16 }}>
          {item.totals.map((total) => formatQty(total.quantity, total.unit)).join(' + ')} · {humanize(item.category)}
          {item.batches.length > 1 ? ` · ${item.batches.length} batches` : ''}
        </ThemedText>
      </View>
      {/* Tinted pill: color carries urgency, background is the same hue at low alpha */}
      <View style={[styles.badge, { backgroundColor: `${badgeColor}26` }]}>
        <ThemedText type="small" style={{ color: badgeColor, fontSize: 12, lineHeight: 16 }}>{expiry.text}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three + 2, paddingHorizontal: Spacing.three, borderRadius: 14 },
  badge: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.two, borderRadius: 6 },
});
