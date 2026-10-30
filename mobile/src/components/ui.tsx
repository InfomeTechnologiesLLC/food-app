import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { notifyInputFocus } from '@/lib/keyboard';

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
  const bg = variant === 'primary' ? theme.tint : variant === 'danger' ? 'transparent' : theme.backgroundSelected;
  const fg = variant === 'primary' ? theme.tintText : variant === 'danger' ? theme.danger : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant !== 'primary' && { borderWidth: 1, borderColor: variant === 'danger' ? theme.danger : theme.controlBorder },
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

export function Input({ label, style, onFocus, onBlur, ...props }: TextInputProps & { label?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: Spacing.one }}>
      {label && <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        onFocus={event => { setFocused(true); notifyInputFocus(); onFocus?.(event); }}
        onBlur={event => { setFocused(false); onBlur?.(event); }}
        // Multi-line boxes start at the top with room around the text (otherwise it touches the border)
        textAlignVertical={props.multiline ? 'top' : undefined}
        style={[styles.input, props.multiline && styles.multiline, { color: theme.text, backgroundColor: theme.background, borderColor: theme.controlBorder }, style, focused && { borderColor: theme.tint, borderWidth: 2 }]}
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
  button: { minHeight: 50, paddingVertical: Spacing.two, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { height: 48, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 16, borderWidth: 1 },
  multiline: { height: undefined, minHeight: 96, paddingTop: 12, paddingBottom: 12, lineHeight: 22 },
  chip: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 1 },
  chipFill: { flexGrow: 1, alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
