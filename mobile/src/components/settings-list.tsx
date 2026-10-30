import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Small uppercase heading above a ListCard. */
export function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

/** Rounded card that stacks ListRows with hairline dividers between them. */
export function ListCard({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      {rows.map((row, i) => (
        <View key={i} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** Icon tile + label on the left, value / chevron (or a custom accessory) on the right. */
export function ListRow({
  icon, iconColor, label, subtitle, value, onPress, right,
}: {
  icon: IconName;
  /** Tints the icon and its tile; neutral when omitted */
  iconColor?: string;
  label: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.iconTile, { backgroundColor: iconColor ? `${iconColor}26` : theme.backgroundSelected }]}>
        <Ionicons name={icon} size={20} color={iconColor ?? theme.text} />
      </View>
      {/* Label and value share the row by their own widths, so short labels leave room for the value */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 90 }}>
        <ThemedText style={{ fontWeight: 700 }}>{label}</ThemedText>
        {subtitle && <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 13, lineHeight: 16 }}>{subtitle}</ThemedText>}
      </View>
      {right ?? (
        <View style={styles.trailing}>
          {value && <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>{value}</ThemedText>}
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, letterSpacing: 0.8, marginTop: Spacing.two, marginBottom: -Spacing.one },
  card: { borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 14 },
  iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Never more than ~half the row, so labels stay on one or two lines
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, maxWidth: '55%', flexShrink: 1 },
});
