import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, ChipGroup, Section, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePantry } from '@/lib/pantry';
import { activePlan, SHOPPING_OPTIONS, shoppingLabel, useGeneratePlan, usePlans, type ShoppingOption } from '@/lib/plans';
import { remaining } from '@/lib/usage';
import { MEAL_TYPES, type MealPlanSummary, type MealType } from '@/lib/types';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function PlansScreen() {
  const theme = useTheme();
  const { user, refreshUser } = useAuth();
  const { data: pantry = [], isSuccess: pantryLoaded } = usePantry();
  const { data: plans = [], isLoading } = usePlans();
  const generate = useGeneratePlan();

  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(3);
  const [mealTypes, setMealTypes] = useState<MealType[]>(['breakfast', 'lunch', 'dinner']);
  const [maxExtraItems, setMaxExtraItems] = useState<ShoppingOption>(5);

  const toggleMeal = (t: MealType) =>
    setMealTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  const onGenerate = () =>
    generate.mutate(
      { days, mealTypes, maxExtraItems },
      {
        onSuccess: (plan) => router.push({ pathname: '/plan/[id]', params: { id: plan._id } }),
        onSettled: () => refreshUser(),
      }
    );

  const current = activePlan(plans);
  const drafts = plans.filter((p) => p.status === 'draft');

  const limitReached = generate.error instanceof ApiError && generate.error.code === 'LIMIT_REACHED';
  const plansLeft = remaining(user, 'plans');
  // Nothing to cook from, so a pantry-only plan can't be generated
  const pantryOnlyEmpty = maxExtraItems === 0 && pantryLoaded && pantry.length === 0;

  return (
    <Screen edges={['bottom']}>
      <ThemedView type="backgroundElement" style={{ borderRadius: 16, padding: Spacing.three, gap: Spacing.three }}>
        <Section title="How many days?">
          <ChipGroup options={DAY_OPTIONS} value={days} onChange={setDays} format={(d) => `${d}`} />
        </Section>
        <Section title="Willing to buy extra ingredients?">
          <ChipGroup options={SHOPPING_OPTIONS} value={maxExtraItems} onChange={setMaxExtraItems} format={shoppingLabel} fill />
          {pantryOnlyEmpty ? (
            <ThemedText type="small" themeColor="danger">
              Your pantry is empty, so there’s nothing to cook from. Scan your groceries or allow a few extra ingredients.
            </ThemedText>
          ) : maxExtraItems === 0 && pantry.length < 4 && (
            <ThemedText type="small" style={{ color: theme.warning }}>
              Your pantry has only {pantry.length} item{pantry.length === 1 ? '' : 's'}, so pantry-only meals will be very simple. Scan your groceries first for better results.
            </ThemedText>
          )}
        </Section>
        <Section title="Meals">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
            {MEAL_TYPES.map((t) => (
              <Chip key={t} label={humanize(t)} selected={mealTypes.includes(t)} onPress={() => toggleMeal(t)} />
            ))}
          </View>
        </Section>

        {generate.isPending ? (
          <View style={{ alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three }}>
            <ActivityIndicator size="large" color={theme.tint} />
            <ThemedText>Planning your meals…</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">This takes about 20–40 seconds.</ThemedText>
          </View>
        ) : (
          <Button title={`Generate ${days}-day plan`} onPress={onGenerate} disabled={mealTypes.length === 0 || pantryOnlyEmpty || limitReached || plansLeft === 0} />
        )}
        {generate.error && <ThemedText themeColor="danger">{generate.error.message}</ThemedText>}
        {(limitReached || plansLeft === 0) && <Button title="See plans" variant="secondary" onPress={() => router.push('/upgrade')} />}
        {plansLeft !== null && (
          <ThemedText type="small" themeColor="textSecondary">{plansLeft} free plan{plansLeft === 1 ? '' : 's'} left this month</ThemedText>
        )}
      </ThemedView>

      <Section title="Current plan">
        {isLoading ? (
          <ActivityIndicator />
        ) : current ? (
          <PlanRow plan={current} />
        ) : (
          <ThemedText themeColor="textSecondary">No plan yet. Generate one above, then add it to your plan.</ThemedText>
        )}
      </Section>

      {drafts.length > 0 && (
        <Section title="Generated, not added">
          {drafts.map((p) => <PlanRow key={p._id} plan={p} />)}
        </Section>
      )}
    </Screen>
  );
}

function PlanRow({ plan: p }: { plan: MealPlanSummary }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p._id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <ThemedView type="backgroundElement" style={{ borderRadius: 12, padding: Spacing.three, gap: 2 }}>
        <ThemedText>{p.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {p.dayCount} day{p.dayCount === 1 ? '' : 's'} · {shoppingLabel(p.maxExtraItems)} · {new Date(p.status === 'active' && p.startDate ? p.startDate : p.createdAt).toLocaleDateString()}
        </ThemedText>
        <ThemedText type="small" style={{ color: p.readyMeals === p.totalMeals ? theme.tint : theme.textSecondary }}>
          {p.readyMeals === p.totalMeals
            ? `All ${p.totalMeals} meals ready to cook`
            : `${p.readyMeals}/${p.totalMeals} meals ready · ${p.shoppingTotal} item${p.shoppingTotal === 1 ? '' : 's'} to buy`}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}
