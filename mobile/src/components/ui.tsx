import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Button({
  title, onPress, variant = 'primary', loading, disabled, icon,
}: {
  title: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.tint : variant === 'danger' ? 'transparent' : theme.backgroundElement;
  const fg = variant === 'primary' ? theme.tintText : variant === 'danger' ? theme.danger : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'danger' && { borderWidth: 1, borderColor: theme.danger },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonContent}>
          {icon && <Ionicons name={icon} size={20} color={fg} />}
          <ThemedText style={{ color: fg, fontWeight: 600 }}>{title}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

export function Input({ label, style, ...props }: TextInputProps & { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      {label && <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}
        {...props}
      />
    </View>
  );
}

export function Chip({ label, selected, onPress, fill }: { label: string; selected?: boolean; onPress?: () => void; fill?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        fill && styles.chipFill,
        // Outlined when unselected so chips still read as buttons on card backgrounds
        { backgroundColor: selected ? theme.tint : theme.backgroundElement, borderColor: selected ? theme.tint : `${theme.textSecondary}66` },
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.tintText : theme.text }}>{label}</ThemedText>
    </Pressable>
  );
}

export function ChipGroup<T extends string | number | null>({
  options, value, onChange, format = String, fill,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
  /** Stretch chips so each wrapped line spans the full width */
  fill?: boolean;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => (
        <Chip key={String(o)} label={format(o)} selected={o === value} onPress={() => onChange(o)} fill={fill} />
      ))}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

export const humanize = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ');

const styles = StyleSheet.create({
  button: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { height: 48, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
  chip: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 1 },
  chipFill: { flexGrow: 1, alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
