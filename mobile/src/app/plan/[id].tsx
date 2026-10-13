import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { MealCard } from '@/components/meal-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, ChipGroup, Section } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import {
  activePlan,
  dayLabel,
  formatQty,
  dateLabel,
  planTarget,
  planDayDate,
  shoppingLabel,
  useActivatePlan,
  useDeletePlan,
  useMarkEaten,
  useMergePlan,
  usePlan,
  usePlans,
  useReplaceDay,
  usePurchaseShoppingItem,
} from '@/lib/plans';
import type { Meal, MealPlan, MealPlanSummary, Shortage } from '@/lib/types';
import { useCalendarDate } from '@/hooks/use-calendar-date';
import { replacementChanges, wholeReplacementChanges } from '@/lib/meal-replacement';
import { useDailyHistory } from '@/lib/history';
import { stockMessage } from '@/lib/stock-message';

type Tab = 'meals' | 'shopping';

const shortageLine = (s: Shortage) => `• ${stockMessage(s)}`;

export default function PlanScreen() {
  const theme = useTheme();
  const date = useCalendarDate();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: plan, isLoading, error } = usePlan(id);
  const { data: plans = [] } = usePlans();
  const toggle = usePurchaseShoppingItem(id);
  const markEaten = useMarkEaten(id);
  const del = useDeletePlan();
  const [tab, setTab] = useState<Tab>('meals');
  const [readyOnly, setReadyOnly] = useState(false);

  if (isLoading) return <Screen edges={['bottom']}><ActivityIndicator style={{ marginTop: Spacing.six }} /></Screen>;
  if (error || !plan) return <Screen edges={['bottom']}><ThemedText themeColor="danger">{error?.message ?? 'Plan not found'}</ThemedText></Screen>;

  const isDraft = plan.status === 'draft';
  const remaining = plan.shoppingList.length;
  const allReady = plan.readyMeals === plan.totalMeals;

  const onDelete = () =>
    showAlert(isDraft ? 'Discard this plan?' : 'Remove your current plan?', isDraft ? plan.title : 'Your food history and pantry deductions will be kept. Uneaten meals in this plan will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: isDraft ? 'Discard' : 'Remove', style: 'destructive', onPress: () => del.mutate(id, { onSuccess: () => router.back() }) },
    ]);

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
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: plan.title }} />
      {isDraft && <DraftActions draft={plan} active={activePlan(plans)} />}

      <ChipGroup<Tab>
        options={['meals', 'shopping']}
        value={tab}
        onChange={setTab}
        format={(t) => (t === 'meals' ? 'Meals' : `Shopping list (${remaining})`)}
      />

      {tab === 'meals' ? (
        <>
          {(!allReady || plan.settingsSnapshot?.maxExtraItems !== 0) && (
          <ThemedView type="backgroundElement" style={{ borderRadius: 12, padding: Spacing.three, gap: Spacing.two }}>
            {!allReady && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                <Ionicons name="restaurant-outline" size={20} color={theme.text} />
                <ThemedText style={{ flex: 1 }}>
                  {`${plan.readyMeals} of ${plan.totalMeals} meals ready to cook now`}
                </ThemedText>
              </View>
            )}
            {plan.settingsSnapshot?.maxExtraItems !== 0 && <ThemedText type="small" themeColor="textSecondary">
              {shoppingLabel(plan.settingsSnapshot?.maxExtraItems)}
              {!allReady && remaining > 0 && ` · buy ${remaining} item${remaining === 1 ? '' : 's'} to unlock the rest`}
            </ThemedText>}
            {!allReady && plan.readyMeals > 0 && (
              <Chip label={readyOnly ? 'Showing ready meals only' : 'Show only ready meals'} selected={readyOnly} onPress={() => setReadyOnly((r) => !r)} />
            )}
          </ThemedView>
          )}

          {plan.days.map((d) => {
            const meals = d.meals.filter((m) => !readyOnly || (!m.eaten && m.readyToCook));
            if (meals.length === 0) return null;
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
                    actionDisabled={markEaten.isPending || del.isPending}
                  />
                ))}
              </View>
            );
          })}
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Suggestions are general guidance, not medical or dietary advice. Always check labels for allergens.
          </ThemedText>
          <Button title={isDraft ? 'Discard plan' : 'Remove plan'} variant="danger" onPress={onDelete} loading={del.isPending} disabled={markEaten.isPending || toggle.isPending} />
        </>
      ) : plan.shoppingList.length === 0 ? (
        <ThemedText themeColor="textSecondary">Nothing to buy. Current stock covers all remaining meals. 🎉</ThemedText>
      ) : (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            Remaining quantities to buy for all uneaten meals. A meal can be ready now while the rest of the plan still needs more. Tap an item to record buying its listed quantity and add it to your pantry.
          </ThemedText>
          {toggle.error && <ThemedText themeColor="danger">{toggle.error.message}</ThemedText>}
          {plan.shoppingList.map((item) => (
              <Pressable
                disabled={toggle.isPending || del.isPending}
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
    </Screen>
  );
}

type Mode = 'merge' | 'replace-day' | null;

/** What to do with a generated plan: use it, add some of its days, or swap one of its days in. */
function DraftActions({ draft, active }: { draft: MealPlan; active?: MealPlanSummary }) {
  const theme = useTheme();
  const date = useCalendarDate();
  const { data: current } = usePlan(active?._id);
  const activate = useActivatePlan();
  const history = useDailyHistory(date);
  const merge = useMergePlan();
  const replaceDay = useReplaceDay();
  const [mode, setMode] = useState<Mode>(null);
  const [mergeDays, setMergeDays] = useState<number[]>([]);
  const [fromDay, setFromDay] = useState<number | null>(null);
  const [toDay, setToDay] = useState<number | null>(null);
  const [replaced, setReplaced] = useState<string | null>(null);

  const error = activate.error ?? merge.error ?? replaceDay.error;
  const openPlan = (planId: string) => router.replace({ pathname: '/plan/[id]', params: { id: planId } });
  const draftDays = draft.days.map((d) => d.day);

  const busy = activate.isPending || merge.isPending || replaceDay.isPending;
  const target = planTarget(current ?? active);
  const wholeChanges = wholeReplacementChanges(current, draft, history.data?.entries ?? [], date);
  const onUse = () => activate.mutate({ id: draft._id, target }, { onSuccess: (plan) => openPlan(plan._id) });

  if (!active) {
    return (
      <ThemedView type="backgroundElement" style={{ borderRadius: 16, padding: Spacing.three, gap: Spacing.two }}>
        <ThemedText type="smallBold">Not in your plan yet</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Look through the meals, then add them to your plan starting today.</ThemedText>
        {(history.data?.totals[date]?.meals ?? 0) > 0 && <ThemedText type="small" themeColor="tint">{history.data?.totals[date]?.meals} eaten meals will be kept in today’s slots.</ThemedText>}
        <Button title="Use this plan" onPress={onUse} loading={activate.isPending} disabled={busy || history.isLoading || !!history.error || (!!active && !current) || !wholeChanges} />
        {history.error && <ThemedText themeColor="danger">{history.error.message}</ThemedText>}
        {error && <ThemedText themeColor="danger">{error.message}</ThemedText>}
      </ThemedView>
    );
  }

  // Defined after the !active return: React Compiler reads active.title while rendering to memoize this
  const onReplacePlan = () =>
    showAlert('Replace your current plan?', `Uneaten meals in "${active.title}" will be replaced. Food history and pantry stock stay intact. Today’s eaten meals will be kept in their slots.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: onUse },
    ]);
  const lastDay = current ? Math.max(...current.days.map((d) => d.day)) : null;
  const upcoming = current?.startDate
    ? current.days.filter((d) => d.date! >= date && (fromDay ? replacementChanges(d.meals, draft.days.find((day) => day.day === fromDay)!.meals) : true)).map((d) => d.day)
    : [];

  return (
    <ThemedView type="backgroundElement" style={{ borderRadius: 16, padding: Spacing.three, gap: Spacing.three }}>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="smallBold">Not in your plan yet</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          You already have a plan, &quot;{active.title}&quot;
          {current?.startDate && lastDay ? ` (until ${planDayDate(current.startDate, lastDay).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })})` : ''}
          . You can only have one, so choose how to use this one.
        </ThemedText>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        <Chip label="Add days to my plan" selected={mode === 'merge'} onPress={() => setMode(mode === 'merge' ? null : 'merge')} />
        <Chip label="Replace a day" selected={mode === 'replace-day'} onPress={() => setMode(mode === 'replace-day' ? null : 'replace-day')} />
      </View>

      {mode === 'merge' && (
        <Section title="Which days should be added to the end of your plan?">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {draftDays.map((day) => (
              <Chip
                key={day}
                label={`Day ${day}`}
                selected={mergeDays.includes(day)}
                onPress={() => setMergeDays((list) => (list.includes(day) ? list.filter((x) => x !== day) : [...list, day]))}
              />
            ))}
          </View>
          <Button
            title={mergeDays.length ? `Add ${mergeDays.length} day${mergeDays.length === 1 ? '' : 's'}` : 'Pick days to add'}
            disabled={!mergeDays.length || busy || !current}
            loading={merge.isPending}
            onPress={() => merge.mutate({ id: draft._id, days: mergeDays, target }, { onSuccess: (plan) => openPlan(plan._id) })}
          />
        </Section>
      )}

      {mode === 'replace-day' && (
        <>
          <Section title="Use this day">
            <ChipGroup<number | null> options={draftDays} value={fromDay} onChange={setFromDay} format={(d) => `Day ${d}`} />
          </Section>
          <Section title="Instead of">
            {!current ? (
              <ActivityIndicator />
            ) : upcoming.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No days with replaceable meals remain. Add days instead.
              </ThemedText>
            ) : (
              <ChipGroup<number | null> options={upcoming} value={toDay} onChange={setToDay} format={(d) => dayLabel(current.days.find((day) => day.day === d)?.date, d!)} />
            )}
          </Section>
          <Button
            title={fromDay && toDay ? `Replace day ${toDay} with day ${fromDay}` : 'Pick both days'}
            disabled={!fromDay || !toDay || !upcoming.includes(toDay) || busy || !current}
            loading={replaceDay.isPending}
            onPress={() =>
              replaceDay.mutate(
                { id: draft._id, fromDay: fromDay!, toDay: toDay!, target },
                {
                  onSuccess: () => {
                    setReplaced(`Day ${toDay} was updated. Its eaten meals were kept.`);
                    setFromDay(null);
                    setToDay(null);
                  },
                }
              )
            }
          />
          {replaced && (
            <>
              <ThemedText type="small" style={{ color: theme.tint }}>{replaced}</ThemedText>
              <Button title="Open my plan" variant="secondary" onPress={() => openPlan(active._id)} />
            </>
          )}
        </>
      )}

      <ThemedText type="small" themeColor="textSecondary">Today’s eaten meals are kept when replacing a day or the whole plan. New meals fill only uneaten slots.</ThemedText>
      {(history.data?.totals[date]?.meals ?? 0) > 0 && <ThemedText type="small" themeColor="tint">{history.data?.totals[date]?.meals} eaten meals will be kept today.</ThemedText>}
      {!wholeChanges && <ThemedText type="small" themeColor="textSecondary">This draft would not change your scheduled meals.</ThemedText>}
      <Button title="Replace my whole plan with this one" variant="secondary" onPress={onReplacePlan} loading={activate.isPending} disabled={busy || history.isLoading || !!history.error || (!!active && !current) || !wholeChanges} />
      {history.error && <ThemedText themeColor="danger">{history.error.message}</ThemedText>}
      {error && <ThemedText themeColor="danger">{error.message}</ThemedText>}
    </ThemedView>
  );
}
