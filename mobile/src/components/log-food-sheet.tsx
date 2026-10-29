import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button, ChipGroup, Input, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useEstimateFood, useLogFood } from '@/lib/coach-api';
import { mealTypeForNow } from '@/lib/nutrition-coach';
import { pickPhoto, type PickSource } from '@/lib/scan';
import { MEAL_TYPES, type FoodEstimate, type MealType } from '@/lib/types';

/**
 * Log food that isn't in the meal plan: describe it or take a photo, check the estimate, then log it.
 * Nothing is saved until the user taps "Log it". Logged food can be undone in Food history.
 */
export function LogFoodSheet({ visible, onClose, initial }: {
  visible: boolean;
  onClose: () => void;
  /** A draft from the coach chat, to confirm */
  initial?: { estimate: FoodEstimate; mealType: MealType };
}) {
  return (
    <BottomSheet visible={visible} title="Log food" subtitle="Describe what you ate or take a photo. Check the estimate before logging it." onClose={onClose}>
      {visible && <LogFoodForm initial={initial} onDone={onClose} />}
    </BottomSheet>
  );
}

function LogFoodForm({ initial, onDone }: { initial?: { estimate: FoodEstimate; mealType: MealType }; onDone: () => void }) {
  const theme = useTheme();
  const estimate = useEstimateFood();
  const log = useLogFood();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<FoodEstimate | null>(initial?.estimate ?? null);
  const [mealType, setMealType] = useState<MealType>(initial?.mealType ?? mealTypeForNow());
  const [source, setSource] = useState<'photo' | 'text' | 'coach'>(initial ? 'coach' : 'text');

  const limitReached = estimate.error instanceof ApiError && estimate.error.code === 'LIMIT_REACHED';
  const fromText = () => { setSource('text'); estimate.mutate({ text: text.trim() }, { onSuccess: setDraft }); };
  const fromPhoto = async (from: PickSource) => {
    let photo;
    try { photo = await pickPhoto(from); } catch (e) { return showAlert('Permission needed', (e as Error).message); }
    if (!photo) return;
    setSource('photo');
    estimate.mutate({ photo, text: text.trim() || undefined }, { onSuccess: setDraft });
  };
  const save = () => {
    if (!draft || !draft.items.length) return;
    log.mutate({ mealType, title: draft.title || draft.items.map((i) => i.name).join(', '), source, items: draft.items }, {
      onSuccess: () => { onDone(); showAlert('Logged', `${draft.title} was added to today. You can undo it in Food history.`); },
      onError: (e) => showAlert('Couldn’t log it', e.message),
    });
  };
  const removeItem = (index: number) => setDraft((d) => {
    if (!d) return d;
    const items = d.items.filter((_, i) => i !== index);
    const sum = (k: 'calories' | 'proteinGrams' | 'carbsGrams' | 'fatGrams') => items.reduce((n, i) => n + i[k], 0);
    return { ...d, items, totals: { calories: sum('calories'), proteinGrams: sum('proteinGrams'), carbsGrams: sum('carbsGrams'), fatGrams: sum('fatGrams') } };
  });

  if (!draft) {
    return (
      <View style={{ gap: Spacing.three }}>
        <Input label="What did you eat?" placeholder="e.g. 2 parathas with curd and a tea" value={text} onChangeText={setText} multiline maxLength={500} />
        <Button title="Estimate calories" icon="sparkles-outline" onPress={fromText} loading={estimate.isPending && source === 'text'} disabled={text.trim().length < 2 || estimate.isPending} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Button title="Take photo" icon="camera-outline" variant="secondary" onPress={() => void fromPhoto('camera')} loading={estimate.isPending && source === 'photo'} disabled={estimate.isPending} /></View>
          <View style={{ flex: 1 }}><Button title="Gallery" icon="images-outline" variant="secondary" onPress={() => void fromPhoto('library')} disabled={estimate.isPending} /></View>
        </View>
        {estimate.error && <ThemedText themeColor="danger">{estimate.error.message}</ThemedText>}
        {limitReached && <Button title="See plans" variant="secondary" onPress={() => { onDone(); router.push('/upgrade'); }} />}
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={{ gap: 2 }}>
        <ThemedText style={{ fontSize: 18, fontWeight: 700 }}>{draft.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          About {draft.totals.calories} kcal · {draft.totals.proteinGrams} g protein · {draft.totals.carbsGrams} g carbs · {draft.totals.fatGrams} g fat
        </ThemedText>
      </View>
      {draft.items.map((item, i) => (
        <View key={`${item.name}-${i}`} style={[styles.item, { borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 600 }}>{item.quantity} {item.unit} {item.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{item.calories} kcal · {item.proteinGrams} g protein</ThemedText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} onPress={() => removeItem(i)} hitSlop={10}>
            <Ionicons name="close-circle-outline" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>
      ))}
      {draft.note ? <ThemedText type="small" themeColor="textSecondary">{draft.note}{draft.confidence === 'low' ? ' The estimate is rough, so check the portions.' : ''}</ThemedText> : null}
      <ChipGroup options={MEAL_TYPES} value={mealType} onChange={setMealType} format={humanize} />
      <Button title="Log it" icon="checkmark-outline" onPress={save} loading={log.isPending} disabled={!draft.items.length} />
      <Pressable accessibilityRole="button" onPress={() => { setDraft(null); estimate.reset(); }} hitSlop={8} style={{ alignSelf: 'center' }}>
        <ThemedText type="smallBold" themeColor="tint">Start again</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
});
