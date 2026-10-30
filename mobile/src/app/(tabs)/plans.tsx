import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { FloatingActions } from '@/components/floating-actions';

import { LogFoodSheet } from '@/components/log-food-sheet';
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
import { activePlan, localDate, SHOPPING_OPTIONS, shoppingLabel, useGeneratePlan, usePlans, usePlan, useReplacePlan, planTarget, type ShoppingOption } from '@/lib/plans';
import { remaining } from '@/lib/usage';
import { MEAL_TYPES, type MealPlan, type MealType } from '@/lib/types';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;
/** The plan the coach suggests without being asked: the next 3 days, main meals, a few items to buy. */
const SUGGESTION = { days: 3, mealTypes: ['breakfast', 'lunch', 'dinner'] as MealType[], maxExtraItems: 5 };
/** Users we already made an automatic suggestion for in this app session, so it never runs twice. */
const suggestedFor = new Set<string>();

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
  const [logging, setLogging] = useState(false);

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

  const plansLeft = remaining(user, 'plans');
  const current = activePlan(plans);
  const { data: currentMeals, error: currentError, isLoading: currentLoading } = usePlan(current?._id);
  const today = localDate();
  const ended = !!currentMeals && currentMeals.days.every((d) => !d.date || d.date < today);
  // Errors from the generator sheet show inside the sheet; the rest show on the page
  const suggestError = !generationOpen && generate.error ? generate.error.message : '';

  /** Plans the next 3 days and saves it straight away (replacing an ended plan), so nothing is lost if the app closes. */
  const suggest = () => {
    generate.reset();
    generate.mutate(SUGGESTION, {
      onSuccess: (plan) => replace.mutate(
        { previewToken: plan.previewToken, target: planTarget(currentMeals ?? current) },
        // Saving failed (for example the plan changed elsewhere): show it as a preview to accept by hand
        { onError: () => setPreview(plan) },
      ),
      onSettled: () => refreshUser(),
    });
  };

  // First visit with no meal plan at all: the coach suggests one without being asked
  const canSuggest = !!user && !isLoading && !plansError && !current && !preview && plansLeft !== 0;
  useEffect(() => {
    if (!canSuggest || !user || suggestedFor.has(user._id) || generate.isPending) return;
    suggestedFor.add(user._id);
    suggest();
    // suggest() only reads state captured for this render; run once when a suggestion becomes possible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSuggest, user?._id]);
  const suggesting = (generate.isPending && !generationOpen) || (replace.isPending && !preview);

  const limitReached = generate.error instanceof ApiError && generate.error.code === 'LIMIT_REACHED';
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
        ) : suggesting ? (
          <View style={[styles.suggesting, { backgroundColor: theme.backgroundElement }]}>
            <ActivityIndicator size="large" color={theme.tint} />
            <ThemedText style={{ fontWeight: 700, textAlign: 'center' }}>Your coach is planning your next 3 days</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Breakfast, lunch and dinner from your pantry, your goal and the foods you like. This takes about 20–40 seconds.
            </ThemedText>
          </View>
        ) : isLoading || currentLoading ? <ActivityIndicator /> : currentMeals ? (
          <>
            <View style={[styles.header, { backgroundColor: theme.backgroundElement }]}>
              <MaterialIcons name="auto-awesome" size={22} color={theme.tint} />
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold">{ended ? 'This meal plan has ended' : 'Suggested by your coach'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{ended ? 'Get a fresh plan for the next 3 days.' : 'From your pantry and goal. Change any meal you don’t like.'}</ThemedText>
              </View>
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                {ended
                  ? <Button title="Plan next 3 days" icon="sparkles-outline" onPress={suggest} disabled={plansLeft === 0} />
                  : <Button title="Log food" icon="add-circle-outline" variant="secondary" onPress={() => setLogging(true)} />}
              </View>
              <View style={{ flex: 1 }}>
                <Button title="New plan" icon="options-outline" variant="secondary" onPress={() => { generate.reset(); setGenerationOpen(true); }} />
              </View>
            </View>
            {!!suggestError && <ThemedText themeColor="danger">{suggestError}</ThemedText>}
            <PlanContent key={currentMeals._id} plan={currentMeals} />
          </>
        ) : currentError || plansError ? (
          <ThemedText themeColor="danger">{(currentError ?? plansError)?.message}</ThemedText>
        ) : (
          <>
            <ThemedText themeColor="textSecondary">No meal plan yet. Your coach plans meals from your pantry that fit your goal, and lists anything you need to buy.</ThemedText>
            {!!suggestError && <ThemedText themeColor="danger">{suggestError}</ThemedText>}
            {plansLeft !== 0 && <Button title="Suggest 3 days of meals" icon="sparkles-outline" onPress={suggest} />}
            <Button title="Choose days and meals" icon="options-outline" variant="secondary" onPress={() => { generate.reset(); setGenerationOpen(true); }} />
            <Button title="Ate something? Log food" icon="add-circle-outline" variant="secondary" onPress={() => setLogging(true)} />
          </>
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
      <LogFoodSheet visible={logging} onClose={() => setLogging(false)} />
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
  suggesting: { alignItems: 'center', gap: Spacing.two, padding: Spacing.four, borderRadius: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 16 },
  row: { flexDirection: 'row', gap: Spacing.two },
  historyButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  addButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
