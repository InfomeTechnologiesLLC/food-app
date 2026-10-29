import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLogFood } from '@/lib/coach-api';
import type { NextMealResult } from '@/lib/types';

/** The coach's next-meal idea: how it fits today's targets, what is in the pantry and what to buy. */
export function MealSuggestionCard({ result }: { result: NextMealResult }) {
  const theme = useTheme();
  const log = useLogFood();
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  const meal = result.meal;

  if (!meal) {
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="small">{result.message}</ThemedText>
      </View>
    );
  }
  const ate = () => log.mutate({
    mealType: meal.type, title: meal.title, source: 'coach',
    items: [{ name: meal.title, quantity: 1, unit: 'serving', calories: meal.calories, ...meal.nutrition }],
  }, { onSuccess: () => setLogged(true), onError: (e) => showAlert('Couldn’t log it', e.message) });

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" themeColor="tint">{humanize(meal.type).toUpperCase()} IDEA</ThemedText>
      <ThemedText style={{ fontSize: 17, fontWeight: 700 }}>{meal.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {meal.calories} kcal · {Math.round(meal.nutrition.proteinGrams)} g protein · {meal.prepMinutes} min
        {result.aim ? `  (aim: ${result.aim.calories} kcal, ${result.aim.proteinGrams} g protein)` : ''}
      </ThemedText>
      <ThemedText type="small">{meal.why}</ThemedText>
      {result.toBuy.length > 0 && (
        <View style={styles.buy}>
          <Ionicons name="cart-outline" size={16} color={theme.warning} />
          <ThemedText type="small" themeColor="warning" style={{ flex: 1 }}>
            Buy: {result.toBuy.map((t) => `${t.quantity} ${t.unit} ${t.name}`).join(', ')}
          </ThemedText>
        </View>
      )}
      <Pressable accessibilityRole="button" onPress={() => setOpen((v) => !v)} hitSlop={8}>
        <ThemedText type="smallBold" themeColor="tint">{open ? 'Hide recipe' : 'Show recipe'}</ThemedText>
      </Pressable>
      {open && (
        <View style={{ gap: 4 }}>
          {meal.ingredients.map((i) => (
            <ThemedText key={i.name} type="small">
              {i.fromPantry ? '✓' : '+'} {i.quantity} {i.unit} {i.name}
            </ThemedText>
          ))}
          {meal.steps.map((s, n) => <ThemedText key={n} type="small" themeColor="textSecondary">{n + 1}. {s}</ThemedText>)}
        </View>
      )}
      {logged
        ? <ThemedText type="smallBold" themeColor="tint">Logged. It now counts toward today.</ThemedText>
        : <Button title="I ate this" icon="checkmark-done-outline" variant="secondary" onPress={ate} loading={log.isPending} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  buy: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
});
