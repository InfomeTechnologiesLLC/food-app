import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatQty } from '@/lib/plans';
import type { Meal, MealType } from '@/lib/types';
import { stockMessage } from '@/lib/stock-message';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const MEAL_ICON: Record<MealType, IconName> = { breakfast: 'sunny-outline', lunch: 'restaurant-outline', snack: 'cafe-outline', dinner: 'moon-outline' };

/** `onToggleEaten` is only passed for the current plan, where meals can be marked as eaten. */
export function MealCard({ meal, onToggleEaten, onChange, toggling, unavailableLabel, actionDisabled }: { meal: Meal; onToggleEaten?: () => void; onChange?: () => void; toggling?: boolean; unavailableLabel?: string; actionDisabled?: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const missing = meal.ingredients.filter((item) => !item.available);
  const status: { icon: IconName; color: string; text: string } = meal.eaten
    ? { icon: 'checkmark-circle', color: theme.tint, text: 'Eaten · saved to your food history' }
    : meal.readyToCook
      ? { icon: 'checkmark-circle-outline', color: theme.tint, text: 'Everything is in your pantry' }
      : { icon: 'cart-outline', color: theme.warning, text: `To buy: ${missing.map((i) => i.name).join(', ')}` };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: meal.allergyWarnings.length ? theme.danger : theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.header}>
        <View style={[styles.icon, { backgroundColor: `${theme.tint}1F` }]}>
          <Ionicons name={MEAL_ICON[meal.type]} size={22} color={theme.tint} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText style={[styles.kind, { color: theme.textSecondary }]}>{humanize(meal.type).toUpperCase()}</ThemedText>
          <ThemedText style={[styles.title, meal.eaten && { color: theme.textSecondary }]}>{meal.title}</ThemedText>
          <View style={styles.meta}>
            {meal.prepMinutes > 0 && <Meta icon="time-outline" text={`${meal.prepMinutes} min`} />}
            <Meta icon="flame-outline" text={`${meal.calories.toFixed(0)} kcal`} />
            <Meta icon="barbell-outline" text={`${meal.nutrition.proteinGrams.toFixed(0)} g protein`} />
          </View>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
      </Pressable>

      <View style={styles.status}>
        <Ionicons name={status.icon} size={16} color={status.color} />
        <ThemedText type="small" style={{ color: status.color, flex: 1 }} numberOfLines={open ? undefined : 1}>{status.text}</ThemedText>
      </View>

      {meal.allergyWarnings.length > 0 && (
        <View style={styles.status}>
          <Ionicons name="warning-outline" size={16} color={theme.danger} />
          <ThemedText type="small" themeColor="danger" style={{ flex: 1 }}>May contain {meal.allergyWarnings.join(', ')}. Check the ingredients or change this meal.</ThemedText>
        </View>
      )}

      {open && (
        <View style={{ gap: Spacing.three }}>
          <ThemedText type="small" themeColor="textSecondary">{meal.description}</ThemedText>
          <View style={styles.macros}>
            {[
              ['kcal', meal.calories.toFixed(0)],
              ['protein', `${meal.nutrition.proteinGrams.toFixed(0)} g`],
              ['carbs', `${meal.nutrition.carbsGrams.toFixed(0)} g`],
              ['fat', `${meal.nutrition.fatGrams.toFixed(0)} g`],
            ].map(([label, value]) => (
              <View key={label} style={[styles.macro, { backgroundColor: theme.background }]}>
                <ThemedText style={{ fontWeight: 700 }}>{value}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{label}</ThemedText>
              </View>
            ))}
          </View>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold">Ingredients</ThemedText>
            {meal.ingredients.map((i, idx) => {
              const have = meal.eaten || i.available;
              return (
                <View key={idx} style={styles.ingredient}>
                  <Ionicons name={have ? 'checkmark' : 'cart-outline'} size={16} color={have ? theme.tint : theme.warning} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="small">{i.name}</ThemedText>
                    {!have && <ThemedText type="small" style={{ color: theme.warning, fontSize: 12 }}>{stockMessage(i)}</ThemedText>}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">{formatQty(i.quantity, i.unit)}</ThemedText>
                </View>
              );
            })}
          </View>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold">How to make it</ThemedText>
            {meal.steps.map((s, idx) => (
              <View key={idx} style={styles.step}>
                <View style={[styles.stepNo, { backgroundColor: theme.background }]}>
                  <ThemedText type="small" style={{ fontWeight: 700, fontSize: 12 }}>{idx + 1}</ThemedText>
                </View>
                <ThemedText type="small" style={{ flex: 1 }}>{s}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}

      {unavailableLabel && <ThemedText type="small" themeColor="textSecondary">{unavailableLabel}</ThemedText>}
      {(onToggleEaten || (onChange && !meal.eaten)) && (
        <View style={[styles.actions, { borderTopColor: theme.border }]}>
          {onToggleEaten && (
            <Pressable
              accessibilityRole="button"
              onPress={onToggleEaten}
              disabled={toggling || actionDisabled}
              style={({ pressed }) => [styles.action, meal.eaten
                ? { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }
                : { backgroundColor: theme.tint }, { opacity: toggling || actionDisabled ? 0.5 : pressed ? 0.8 : 1 }]}>
              {toggling ? <ActivityIndicator color={meal.eaten ? theme.text : theme.tintText} /> : (
                <>
                  <Ionicons name={meal.eaten ? 'arrow-undo-outline' : 'checkmark'} size={16} color={meal.eaten ? theme.text : theme.tintText} />
                  <ThemedText type="smallBold" style={{ color: meal.eaten ? theme.text : theme.tintText }}>{meal.eaten ? 'Undo' : 'Mark as eaten'}</ThemedText>
                </>
              )}
            </Pressable>
          )}
          {onChange && !meal.eaten && (
            <Pressable accessibilityRole="button" onPress={onChange} disabled={actionDisabled}
              style={({ pressed }) => [styles.action, { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1, opacity: pressed ? 0.8 : 1 }]}>
              <Ionicons name="swap-horizontal" size={16} color={theme.text} />
              <ThemedText type="smallBold">Change</ThemedText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Meta({ icon, text }: { icon: IconName; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={13} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: Spacing.three, gap: Spacing.two, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  kind: { fontSize: 11, lineHeight: 14, fontWeight: 700, letterSpacing: 1 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: 700 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  macros: { flexDirection: 'row', gap: Spacing.two },
  macro: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 12 },
  ingredient: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  stepNo: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, marginTop: Spacing.one },
  action: { flex: 1, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
