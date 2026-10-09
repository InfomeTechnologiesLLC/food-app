import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatQty } from '@/lib/plans';
import type { Meal } from '@/lib/types';

/** `onToggleMade` is only passed for the current plan, where meals can be marked as made. */
export function MealCard({ meal, onToggleMade, toggling }: { meal: Meal; onToggleMade?: () => void; toggling?: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: meal.allergyWarnings.length ? theme.danger : 'transparent', opacity: meal.made ? 0.7 : 1 },
      ]}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText type="small" themeColor="tint">{humanize(meal.type).toUpperCase()}</ThemedText>
          <ThemedText type="smallBold" style={{ fontSize: 16 }}>{meal.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {meal.prepMinutes} min · ~{meal.calories} kcal
          </ThemedText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />
      </View>

      {meal.made ? <MadeBadge /> : <ReadyBadge meal={meal} />}

      {meal.allergyWarnings.length > 0 && (
        <ThemedText type="small" themeColor="danger">
          ⚠ May contain {meal.allergyWarnings.join(', ')}. Check the ingredients or skip this meal.
        </ThemedText>
      )}

      {open && (
        <View style={{ gap: Spacing.three }}>
          <ThemedText type="small" themeColor="textSecondary">{meal.description}</ThemedText>
          <View style={{ gap: 4 }}>
            <ThemedText type="smallBold">Ingredients</ThemedText>
            {meal.ingredients.map((i, idx) => (
              <View key={idx} style={{ flexDirection: 'row', gap: Spacing.two }}>
                <Ionicons name={i.available ? 'checkmark-circle' : 'cart-outline'} size={16} color={i.available ? theme.tint : theme.warning} style={{ marginTop: 2 }} />
                <ThemedText type="small" style={{ flex: 1 }}>
                  {i.name} · {formatQty(i.quantity, i.unit)}
                  {!i.available && <ThemedText type="small" style={{ color: theme.warning }}>  (to buy)</ThemedText>}
                </ThemedText>
              </View>
            ))}
          </View>
          <View style={{ gap: 4 }}>
            <ThemedText type="smallBold">Steps</ThemedText>
            {meal.steps.map((s, idx) => (
              <ThemedText key={idx} type="small">{idx + 1}. {s}</ThemedText>
            ))}
          </View>
        </View>
      )}

      {onToggleMade && (
        <Pressable
          onPress={onToggleMade}
          disabled={toggling}
          style={({ pressed }) => [styles.madeButton, { backgroundColor: theme.backgroundSelected, borderColor: theme.border, opacity: toggling ? 0.5 : pressed ? 0.7 : 1 }]}>
          {toggling ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <>
              <Ionicons name={meal.made ? 'arrow-undo-outline' : 'checkmark-done-outline'} size={16} color={theme.text} />
              <ThemedText type="small">{meal.made ? 'Undo, I didn\'t make it' : 'I made this'}</ThemedText>
            </>
          )}
        </Pressable>
      )}
    </Pressable>
  );
}

function MadeBadge() {
  const theme = useTheme();
  return (
    <View style={[styles.badge, { borderColor: theme.tint }]}>
      <Ionicons name="checkmark-circle" size={14} color={theme.tint} />
      <ThemedText type="small" style={{ color: theme.tint }}>Made · ingredients taken from pantry</ThemedText>
    </View>
  );
}

function ReadyBadge({ meal }: { meal: Meal }) {
  const theme = useTheme();
  const ready = meal.readyToCook;
  const color = ready ? theme.tint : theme.warning;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Ionicons name={ready ? 'flame' : 'cart'} size={14} color={color} />
      <ThemedText type="small" style={{ color, flexShrink: 1 }} numberOfLines={2}>
        {ready
          ? 'Ready to cook now'
          : `Need ${meal.missing.length} item${meal.missing.length === 1 ? '' : 's'}: ${meal.missing.join(', ')}`}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2, maxWidth: '100%' },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  madeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 10, borderWidth: 1 },
});
