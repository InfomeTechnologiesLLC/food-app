import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { ChangeMealSheet } from '@/components/change-meal-sheet';
import { MealCard } from '@/components/meal-card';
import { ThemedText } from '@/components/themed-text';
import { Button, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import {
  dayLabel,
  formatQty,
  dateLabel,
  useMarkEaten,
  usePurchaseShoppingItem,
} from '@/lib/plans';
import { MEAL_TYPES, type Meal, type MealPlan, type MealType, type Shortage } from '@/lib/types';
import { useCalendarDate } from '@/hooks/use-calendar-date';
import { stockMessage } from '@/lib/stock-message';

/** A day's date, or the whole week */
type DayTab = string | 'all';
/** The order of a day: breakfast, lunch, snack, dinner */
const DAY_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const dayNumber = (date: string) => new Date(`${date}T12:00:00`).getDate();

const shortageLine = (s: Shortage) => `• ${stockMessage(s)}`;

export function PlanContent({ plan, preview = false, onDiscard, busy = false }: { plan: MealPlan; preview?: boolean; onDiscard?: () => void; busy?: boolean }) {
  const theme = useTheme();
  const date = useCalendarDate();
  const id = plan._id;
  const toggle = usePurchaseShoppingItem(id);
  const markEaten = useMarkEaten(id);
  const isDraft = preview;
  const remaining = plan.shoppingList.length;
  const mealDays = plan.days.filter((day) => day.meals.length > 0);
  const dayTabs = mealDays.map((d) => d.date ?? `day-${d.day}`);
  // Open on today when the plan covers it, otherwise on the first day
  const [tab, setTab] = useState<DayTab>(() => (dayTabs.includes(date) ? date : dayTabs[0] ?? 'all'));
  const [view, setView] = useState<'meals' | 'shopping'>('meals');
  const [mealType, setMealType] = useState<MealType | 'all'>('all');
  const [changing, setChanging] = useState<Meal | null>(null);
  const types = DAY_ORDER.filter((t) => MEAL_TYPES.includes(t) && mealDays.some((d) => d.meals.some((m) => m.type === t)));
  const visibleDays = (tab === 'all' ? mealDays : mealDays.filter((day) => (day.date ?? `day-${day.day}`) === tab))
    .map((day) => ({ ...day, meals: (mealType === 'all' ? day.meals : day.meals.filter((m) => m.type === mealType)).slice().sort((a, b) => DAY_ORDER.indexOf(a.type) - DAY_ORDER.indexOf(b.type)) }))
    .filter((day) => day.meals.length > 0);

  const onToggleEaten = (meal: Meal) => {
    const run = (confirm: boolean) => {
      markEaten.mutate(
        { mealId: meal._id, historyEntryId: meal.historyEntryId, eaten: !meal.eaten, confirm, revision: plan.__v },
        {
          onError: (e) => {
            if (e instanceof ApiError && e.code === 'SHORTAGE') {
              const shortages: Shortage[] = e.data?.shortages ?? [];
              showAlert(
                'Not enough in your pantry',
                `${shortages.map(shortageLine).join('\n')}\n\nMark as eaten anyway? Whatever you have of these will be used up.`,
                [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark as eaten', onPress: () => run(true) }]
              );
            } else {
              showAlert("Couldn't update this meal", e.message);
            }
          },
        }
      );
    };
    if (meal.eaten) {
      showAlert('Undo eaten meal?', 'This removes the meal from your history and restores only pantry stock originally deducted.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Undo', onPress: () => run(false) },
      ]);
    } else run(false);
  };

  return (
    <View style={{ gap: Spacing.three }}>
      {/* Meals or shopping list */}
      <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
        {(['meals', 'shopping'] as const).map((v) => (
          <Pressable key={v} accessibilityRole="tab" accessibilityState={{ selected: view === v }} onPress={() => setView(v)}
            style={[styles.segmentItem, view === v && { backgroundColor: theme.background }]}>
            <Ionicons name={v === 'meals' ? 'restaurant-outline' : 'cart-outline'} size={16} color={view === v ? theme.text : theme.textSecondary} />
            <ThemedText type="smallBold" themeColor={view === v ? 'text' : 'textSecondary'}>{v === 'meals' ? 'Meals' : `To buy (${remaining})`}</ThemedText>
          </Pressable>
        ))}
      </View>

      {view === 'meals' ? (
        <>
          {/* Days of the plan, then the whole week */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.three }} contentContainerStyle={{ gap: Spacing.two, paddingHorizontal: Spacing.three }}>
            {[...dayTabs, ...(dayTabs.length > 1 ? ['all'] : [])].map((t) => {
              const selected = tab === t;
              const d = mealDays.find((x) => (x.date ?? `day-${x.day}`) === t);
              return (
                <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(t)}
                  style={[styles.day, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
                  <ThemedText type="small" style={{ fontSize: 12, color: selected ? theme.tintText : theme.textSecondary }}>
                    {t === 'all' ? 'All' : t === date ? 'Today' : d?.date ? weekday(d.date) : `Day`}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 18, fontWeight: 700, color: selected ? theme.tintText : theme.text }}>
                    {t === 'all' ? mealDays.length : d?.date ? dayNumber(d.date) : d?.day}
                  </ThemedText>
                  <ThemedText type="small" style={{ fontSize: 11, color: selected ? theme.tintText : theme.textSecondary }}>
                    {t === 'all' ? 'days' : `${d?.meals.filter((m) => m.eaten).length ?? 0}/${d?.meals.length ?? 0}`}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
          {/* Only one kind of meal, e.g. breakfast */}
          {types.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.three }} contentContainerStyle={{ gap: Spacing.two, paddingHorizontal: Spacing.three }}>
              {(['all', ...types] as const).map((t) => {
                const selected = mealType === t;
                return (
                  <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setMealType(t)}
                    style={[styles.filter, { backgroundColor: selected ? theme.text : 'transparent', borderColor: selected ? theme.text : theme.border }]}>
                    <ThemedText type="smallBold" style={{ color: selected ? theme.background : theme.text }}>{t === 'all' ? 'All meals' : humanize(t)}</ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {visibleDays.length === 0 && (
            <ThemedText themeColor="textSecondary">No {mealType === 'all' ? 'meals' : humanize(mealType).toLowerCase()} planned for this day.</ThemedText>
          )}
          {visibleDays.map((d) => {
            const meals = d.meals;
            return (
              <View key={d.day} style={{ gap: Spacing.two }}>
                {tab === 'all' && <ThemedText type="smallBold">{d.date === date ? 'Today' : dayLabel(d.date, d.day)}</ThemedText>}
                {meals.map((m) => (
                  <MealCard
                    key={m._id}
                    meal={m}
                    onToggleEaten={isDraft || (!m.eaten && d.date! > date) ? undefined : () => onToggleEaten(m)}
                    onChange={isDraft || (d.date && d.date < date) ? undefined : () => setChanging(m)}
                    unavailableLabel={!isDraft && !m.eaten && d.date! > date ? `Available to mark on ${dateLabel(d.date!)}` : undefined}
                    toggling={markEaten.isPending && markEaten.variables?.mealId === m._id}
                    actionDisabled={markEaten.isPending}
                  />
                ))}
              </View>
            );
          })}
          {isDraft && <Button title="Discard preview" variant="danger" onPress={() => onDiscard?.()} disabled={busy || markEaten.isPending || toggle.isPending} />}
          {!isDraft && <ChangeMealSheet plan={plan} meal={changing} onClose={() => setChanging(null)} />}
        </>
      ) : plan.shoppingList.length === 0 ? (
        <ThemedText themeColor="textSecondary">Nothing to buy. Current stock covers all remaining meals. 🎉</ThemedText>
      ) : (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            Remaining quantities to buy for all uneaten meals. A meal can be ready now while the rest of the plan still needs more. {preview ? 'Accept this plan to record purchases.' : 'Tap an item to record buying its listed quantity and add it to your pantry.'}
          </ThemedText>
          {toggle.error && <ThemedText themeColor="danger">{toggle.error.message}</ThemedText>}
          {plan.shoppingList.map((item) => (
              <Pressable
                disabled={preview || toggle.isPending}
                key={item._id}
                onPress={() => toggle.mutate({ itemId: item._id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 12, backgroundColor: theme.backgroundElement }}>
                <Ionicons name="square-outline" size={22} color={theme.textSecondary} />
                <ThemedText style={{ flex: 1 }}>
                  {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{formatQty(item.quantity, item.unit)}</ThemedText>
              </Pressable>
            ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', padding: 4, borderRadius: 14 },
  segmentItem: { flex: 1, height: 38, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  day: { width: 58, paddingVertical: Spacing.two, borderRadius: 16, alignItems: 'center', gap: 2 },
  filter: { height: 34, paddingHorizontal: Spacing.three, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
