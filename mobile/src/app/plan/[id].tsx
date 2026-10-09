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
  isUpcoming,
  planDayDate,
  shoppingLabel,
  useActivatePlan,
  useDeletePlan,
  useMarkMade,
  useMergePlan,
  usePlan,
  usePlans,
  useReplaceDay,
  useToggleShoppingItem,
} from '@/lib/plans';
import type { Meal, MealPlan, MealPlanSummary, Shortage } from '@/lib/types';

type Tab = 'meals' | 'shopping';

const shortageLine = (s: Shortage) =>
  s.unitMismatch
    ? `• ${s.name}: needs ${formatQty(s.needed, s.unit)}, but your pantry lists it in a different unit. Update it yourself.`
    : s.have > 0
      ? `• ${s.name}: needs ${formatQty(s.needed, s.unit)}, you have ${formatQty(s.have, s.unit)}`
      : `• ${s.name}: needs ${formatQty(s.needed, s.unit)}, not in your pantry`;

export default function PlanScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: plan, isLoading, error } = usePlan(id);
  const { data: plans = [] } = usePlans();
  const toggle = useToggleShoppingItem(id);
  const markMade = useMarkMade(id);
  const del = useDeletePlan();
  const [tab, setTab] = useState<Tab>('meals');
  const [readyOnly, setReadyOnly] = useState(false);
  const [pendingMeal, setPendingMeal] = useState<string | null>(null);

  if (isLoading) return <Screen edges={['bottom']}><ActivityIndicator style={{ marginTop: Spacing.six }} /></Screen>;
  if (error || !plan) return <Screen edges={['bottom']}><ThemedText themeColor="danger">{error?.message ?? 'Plan not found'}</ThemedText></Screen>;

  const isDraft = plan.status === 'draft';
  const remaining = plan.shoppingList.filter((i) => !i.checked).length;
  const allReady = plan.readyMeals === plan.totalMeals;

  const onDelete = () =>
    showAlert(isDraft ? 'Discard this plan?' : 'Delete your current plan?', plan.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: isDraft ? 'Discard' : 'Delete', style: 'destructive', onPress: () => del.mutate(id, { onSuccess: () => router.back() }) },
    ]);

  const onToggleMade = (day: number, index: number, meal: Meal) => {
    const run = (confirm: boolean) => {
      setPendingMeal(`${day}-${index}`);
      markMade.mutate(
        { day, index, made: !meal.made, confirm },
        {
          onError: (e) => {
            if (e instanceof ApiError && e.code === 'SHORTAGE') {
              const shortages: Shortage[] = e.data?.shortages ?? [];
              showAlert(
                'Not enough in your pantry',
                `${shortages.map(shortageLine).join('\n')}\n\nMark as made anyway? Whatever you have of these will be used up.`,
                [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark as made', onPress: () => run(true) }]
              );
            } else {
              showAlert("Couldn't update this meal", e.message);
            }
          },
          onSettled: () => setPendingMeal(null),
        }
      );
    };
    run(false);
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
            const meals = d.meals.map((m, idx) => ({ m, idx })).filter(({ m }) => !readyOnly || m.readyToCook);
            if (meals.length === 0) return null;
            return (
              <View key={d.day} style={{ gap: Spacing.two }}>
                <ThemedText type="smallBold">{dayLabel(isDraft ? undefined : plan.startDate, d.day)}</ThemedText>
                {meals.map(({ m, idx }) => (
                  <MealCard
                    key={idx}
                    meal={m}
                    onToggleMade={isDraft ? undefined : () => onToggleMade(d.day, idx, m)}
                    toggling={pendingMeal === `${d.day}-${idx}`}
                  />
                ))}
              </View>
            );
          })}
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Suggestions are general guidance, not medical or dietary advice. Always check labels for allergens.
          </ThemedText>
          <Button title={isDraft ? 'Discard plan' : 'Delete plan'} variant="danger" onPress={onDelete} loading={del.isPending} />
        </>
      ) : plan.shoppingList.length === 0 ? (
        <ThemedText themeColor="textSecondary">Nothing to buy. This plan only uses what's in your pantry. 🎉</ThemedText>
      ) : (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            Items the plan needs that aren't in your pantry. Tick them off as you buy them, and meals that use them become ready to cook.
          </ThemedText>
          {[...plan.shoppingList]
            .sort((a, b) => Number(a.checked) - Number(b.checked))
            .map((item) => (
              <Pressable
                key={item._id}
                onPress={() => toggle.mutate({ itemId: item._id, checked: !item.checked })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 12, backgroundColor: theme.backgroundElement }}>
                <Ionicons name={item.checked ? 'checkbox' : 'square-outline'} size={22} color={item.checked ? theme.tint : theme.textSecondary} />
                <ThemedText style={{ flex: 1, textDecorationLine: item.checked ? 'line-through' : 'none', opacity: item.checked ? 0.5 : 1 }}>
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
  const { data: current } = usePlan(active?._id);
  const activate = useActivatePlan();
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

  const onUse = () => activate.mutate(draft._id);

  if (!active) {
    return (
      <ThemedView type="backgroundElement" style={{ borderRadius: 16, padding: Spacing.three, gap: Spacing.two }}>
        <ThemedText type="smallBold">Not in your plan yet</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Look through the meals, then add them to your plan starting today.</ThemedText>
        <Button title="Use this plan" onPress={onUse} loading={activate.isPending} />
        {error && <ThemedText themeColor="danger">{error.message}</ThemedText>}
      </ThemedView>
    );
  }

  // Defined after the !active return: React Compiler reads active.title while rendering to memoize this
  const onReplacePlan = () =>
    showAlert('Replace your current plan?', `"${active.title}" will be deleted, along with which of its meals you marked as made.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: onUse },
    ]);
  const lastDay = current ? Math.max(...current.days.map((d) => d.day)) : null;
  const upcoming = current?.startDate
    ? current.days.filter((d) => isUpcoming(current.startDate!, d.day) && !d.meals.some((m) => m.made)).map((d) => d.day)
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
            disabled={!mergeDays.length}
            loading={merge.isPending}
            onPress={() => merge.mutate({ id: draft._id, days: mergeDays }, { onSuccess: (plan) => openPlan(plan._id) })}
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
                Your plan has no upcoming days left to replace. Add days instead.
              </ThemedText>
            ) : (
              <ChipGroup<number | null> options={upcoming} value={toDay} onChange={setToDay} format={(d) => dayLabel(current.startDate, d!)} />
            )}
          </Section>
          <Button
            title={fromDay && toDay ? `Replace day ${toDay} with day ${fromDay}` : 'Pick both days'}
            disabled={!fromDay || !toDay}
            loading={replaceDay.isPending}
            onPress={() =>
              replaceDay.mutate(
                { id: draft._id, fromDay: fromDay!, toDay: toDay! },
                {
                  onSuccess: () => {
                    setReplaced(`Day ${toDay} of your plan now uses day ${fromDay} from here.`);
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

      <Button title="Replace my whole plan with this one" variant="secondary" onPress={onReplacePlan} loading={activate.isPending} />
      {error && <ThemedText themeColor="danger">{error.message}</ThemedText>}
    </ThemedView>
  );
}
