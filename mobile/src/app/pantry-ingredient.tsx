import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, humanize, Section } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { expiryLabel, usePantry } from '@/lib/pantry';
import { formatQty } from '@/lib/quantities';

export default function PantryIngredientScreen() {
  const { ingredientId } = useLocalSearchParams<{ ingredientId: string }>();
  const { data: ingredients = [], isLoading, error, refetch } = usePantry();
  const ingredient = ingredients.find((item) => item._id === ingredientId);
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: ingredient?.name ?? 'Pantry ingredient' }} />
      {isLoading ? <ActivityIndicator /> : error ? (
        <><ThemedText themeColor="danger">Couldn’t load this ingredient.</ThemedText><Button title="Retry" onPress={() => refetch()} /></>
      ) : ingredient ? (
        <>
          <ThemedText type="subtitle">{ingredient.name}</ThemedText>
          <ThemedText>{ingredient.totals.map((total) => formatQty(total.quantity, total.unit)).join(' + ')} in your pantry</ThemedText>
          {ingredient.totals.length > 1 && <ThemedText themeColor="warning">These units cannot be combined automatically. Correct a batch’s unit and quantity if needed.</ThemedText>}
          <Button title={`Add more ${ingredient.name}`} onPress={() => router.push({ pathname: '/pantry-item', params: { name: ingredient.name, unit: ingredient.totals[0].unit, category: ingredient.category } })} />
          <Section title="Stock batches">
            <ThemedText type="small" themeColor="textSecondary">Cooking uses the earliest expiry first. Edit a batch to correct its quantity; add more to increase your stock.</ThemedText>
            {ingredient.batches.map((batch, index) => (
              <View key={batch._id} style={{ gap: Spacing.two, paddingVertical: Spacing.two }}>
                <ThemedText type="smallBold">Batch {index + 1} · {formatQty(batch.quantity, batch.unit)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {batch.expiryDate ? `Expires ${new Date(batch.expiryDate).toLocaleDateString()} · ${expiryLabel(batch.expiryDate).text}` : 'No expiry date'} · {humanize(batch.source)}
                </ThemedText>
                <Button title="Correct or remove batch" variant="secondary" onPress={() => router.push({ pathname: '/pantry-item', params: { ingredientId: ingredient._id, batchId: batch._id } })} />
              </View>
            ))}
          </Section>
        </>
      ) : <ThemedText themeColor="textSecondary">There is no stock left for this ingredient.</ThemedText>}
    </Screen>
  );
}
