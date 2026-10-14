import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { FloatingActions } from '@/components/floating-actions';

import { PlanContent } from '@/components/plan-content';
import { BottomSheet } from '@/components/bottom-sheet';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, ChipGroup, Section, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePantry } from '@/lib/pantry';
import { activePlan, SHOPPING_OPTIONS, shoppingLabel, useGeneratePlan, usePlans, usePlan, useReplacePlan, planTarget, type ShoppingOption } from '@/lib/plans';
import { remaining } from '@/lib/usage';
import { MEAL_TYPES, type MealPlan, type MealType } from '@/lib/types';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function PlansScreen() {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [generationOpen, setGenerationOpen] = useState(false);
  const { user, refreshUser } = useAuth();
  const { data: pantry = [], isSuccess: pantryLoaded } = usePantry();
  const { data: plans = [], isLoading, error: plansError } = usePlans();
  const generate = useGeneratePlan();
  const replace = useReplacePlan();
  const [preview, setPreview] = useState<(MealPlan & { previewToken: string }) | null>(null);

  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(3);
  const [mealTypes, setMealTypes] = useState<MealType[]>(['breakfast', 'lunch', 'dinner']);
  const [maxExtraItems, setMaxExtraItems] = useState<ShoppingOption>(5);

  const toggleMeal = (t: MealType) =>
    setMealTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  const onGenerate = () =>
    generate.mutate(
      { days, mealTypes, maxExtraItems },
      {
        onSuccess: (plan) => {
          setGenerationOpen(false);
          setPreview(plan);
        },
        onSettled: () => refreshUser(),
      }
    );

  const current = activePlan(plans);
  const { data: currentMeals, error: currentError, isLoading: currentLoading } = usePlan(current?._id);

  const limitReached = generate.error instanceof ApiError && generate.error.code === 'LIMIT_REACHED';
  const plansLeft = remaining(user, 'plans');
  // Nothing to cook from, so a pantry-only plan can't be generated
  const pantryOnlyEmpty = maxExtraItems === 0 && pantryLoaded && pantry.length === 0;

  return (
    <View style={styles.page}>
      <Screen edges={[]}>
        {preview ? (
          <>
            <Section title="Preview your new plan">
              <ThemedText themeColor="textSecondary">This preview is temporary. {current ? 'Replace your current plan or discard it.' : 'Use this plan or discard it.'} Today’s eaten meals will be kept.</ThemedText>
              <Button title={current ? 'Replace current plan' : 'Use this plan'} loading={replace.isPending} disabled={isLoading || currentLoading || !!currentError || !!plansError} onPress={() => replace.mutate({ previewToken: preview.previewToken, target: planTarget(currentMeals ?? current) }, { onSuccess: () => setPreview(null) })} />
              <Button title="Discard preview" variant="secondary" disabled={replace.isPending} onPress={() => { setPreview(null); replace.reset(); }} />
              {replace.error && <ThemedText themeColor="danger">{replace.error.message}</ThemedText>}
            </Section>
            <PlanContent key={preview._id} plan={preview} preview busy={replace.isPending} onDiscard={() => { setPreview(null); replace.reset(); }} />
          </>
        ) : isLoading || currentLoading ? <ActivityIndicator /> : currentMeals ? (
          <PlanContent key={currentMeals._id} plan={currentMeals} />
        ) : currentError || plansError ? (
          <ThemedText themeColor="danger">{(currentError ?? plansError)?.message}</ThemedText>
        ) : (
          <ThemedText themeColor="textSecondary">No planned meals yet. Tap + to generate a plan.</ThemedText>
        )}
      </Screen>
      <FloatingActions>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Food history"
          onPress={() => router.push('/food-history')}
          style={({ pressed }) => [styles.historyButton, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
          <MaterialIcons name="access-time" size={22} color={theme.tintText} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate meal plan"
          disabled={!!preview || generate.isPending}
          onPress={() => { generate.reset(); setGenerationOpen(true); }}
          style={({ pressed }) => [styles.addButton, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
          <MaterialIcons name="add" size={30} color={theme.tintText} />
        </Pressable>
      </FloatingActions>
      <BottomSheet visible={generationOpen} title="Generate meal plan" onClose={() => setGenerationOpen(false)}>
        <ScrollView style={{ maxHeight: height * 0.65 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
            {(limitReached || plansLeft === 0) && <Button title="See plans" variant="secondary" onPress={() => { setGenerationOpen(false); router.push('/upgrade'); }} />}
            {plansLeft !== null && (
              <ThemedText type="small" themeColor="textSecondary">{plansLeft} free plan{plansLeft === 1 ? '' : 's'} left this month</ThemedText>
            )}
          </ThemedView>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  historyButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  addButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
