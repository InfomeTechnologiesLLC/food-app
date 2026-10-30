import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { notifyInputFocus } from '@/lib/keyboard';
import type { ReviewItem } from '@/lib/scan';

const EXPIRY_STEPS = [null, 2, 3, 5, 7, 14, 30] as const;

export function ReviewRow({
  item, onChange, onRemove,
}: {
  item: ReviewItem;
  onChange: (patch: Partial<ReviewItem>) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }];

  // Tapping the expiry pill cycles through common shelf lives
  const cycleExpiry = () => {
    const idx = EXPIRY_STEPS.findIndex((d) => d === item.expiryDays);
    const next = idx === -1 ? EXPIRY_STEPS.find((d) => d != null && d > (item.expiryDays ?? 0)) ?? null : EXPIRY_STEPS[(idx + 1) % EXPIRY_STEPS.length];
    onChange({ expiryDays: next });
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: item.lowConfidence ? theme.warning : 'transparent' },
      ]}>
      <View style={styles.row}>
        <TextInput onFocus={notifyInputFocus} value={item.name} onChangeText={(name) => onChange({ name })} style={[inputStyle, { flex: 1 }]} placeholder="Item name" placeholderTextColor={theme.textSecondary} />
        <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${item.name}`}>
          <Ionicons name="close-circle" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.row}>
        <TextInput onFocus={notifyInputFocus} value={item.quantity} onChangeText={(quantity) => onChange({ quantity })} keyboardType="decimal-pad" style={[inputStyle, { width: 70 }]} />
        <TextInput onFocus={notifyInputFocus} value={item.unit} onChangeText={(unit) => onChange({ unit })} autoCapitalize="none" style={[inputStyle, { width: 80 }]} />
        <Pressable onPress={cycleExpiry} style={[styles.pill, { backgroundColor: theme.background }]}>
          <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
          <ThemedText type="small">{item.expiryDays == null ? 'No expiry' : `~${item.expiryDays}d`}</ThemedText>
        </Pressable>
      </View>
      {item.lowConfidence && (
        <ThemedText type="small" style={{ color: theme.warning }}>Not sure about this one. Please check it.</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: 12, gap: Spacing.two, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { height: 40, borderRadius: 8, paddingHorizontal: Spacing.two, fontSize: 15, borderWidth: StyleSheet.hairlineWidth },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: Spacing.three, borderRadius: 8 },
});
