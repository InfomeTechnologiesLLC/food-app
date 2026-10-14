import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { MealCard } from '@/components/meal-card';
import { ThemedText } from '@/components/themed-text';
import { Button, ChipGroup } from '@/components/ui';
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
import type { Meal, MealPlan, Shortage } from '@/lib/types';
import { useCalendarDate } from '@/hooks/use-calendar-date';
import { stockMessage } from '@/lib/stock-message';

type Tab = 'meals' | 'allMeals' | 'shopping';

const shortageLine = (s: Shortage) => `• ${stockMessage(s)}`;

export function PlanContent({ plan, preview = false, onDiscard, busy = false }: { plan: MealPlan; preview?: boolean; onDiscard?: () => void; busy?: boolean }) {
  const theme = useTheme();
  const date = useCalendarDate();
  const id = plan._id;
  const toggle = usePurchaseShoppingItem(id);
  const markEaten = useMarkEaten(id);
  const [tab, setTab] = useState<Tab>('meals');

  const isDraft = preview;
  const remaining = plan.shoppingList.length;
  const mealDays = plan.days.filter((day) => day.meals.length > 0);
  const visibleDays = tab === 'allMeals' ? mealDays : mealDays.filter((day) => day.date === date);

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
      <ThemedText type="smallBold">{plan.title}</ThemedText>

      <ChipGroup<Tab>
        options={['meals', 'allMeals', 'shopping']}
        value={tab}
        onChange={setTab}
        format={(t) => (t === 'meals' ? 'Meals' : t === 'allMeals' ? 'Meals(all)' : `Shopping list (${remaining})`)}
      />

      {tab !== 'shopping' ? (
        <>
          {visibleDays.length === 0 && (
            <ThemedText themeColor="textSecondary">{tab === 'meals' ? 'No meals planned for today.' : 'No meals planned.'}</ThemedText>
          )}
          {visibleDays.map((d) => {
            const meals = d.meals;
            return (
              <View key={d.day} style={{ gap: Spacing.two }}>
                <ThemedText type="smallBold">{dayLabel(d.date, d.day)}</ThemedText>
                {meals.map((m) => (
                  <MealCard
                    key={m._id}
                    meal={m}
                    onToggleEaten={isDraft || (!m.eaten && d.date! > date) ? undefined : () => onToggleEaten(m)}
                    unavailableLabel={!isDraft && !m.eaten && d.date! > date ? `Available to mark on ${dateLabel(d.date!)}` : undefined}
                    toggling={markEaten.isPending && markEaten.variables?.mealId === m._id}
                    actionDisabled={markEaten.isPending}
                  />
                ))}
              </View>
            );
          })}
          {isDraft && <Button title="Discard preview" variant="danger" onPress={() => onDiscard?.()} disabled={busy || markEaten.isPending || toggle.isPending} />}
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
