import { useState } from 'react';
import { Switch, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useChangeMeal } from '@/lib/plans';
import type { Meal, MealPlan } from '@/lib/types';

/** "I don't like potato, use egg": asks the coach for a new version of one meal. */
export function ChangeMealSheet({ plan, meal, onClose }: { plan: MealPlan; meal: Meal | null; onClose: () => void }) {
  return (
    <BottomSheet visible={!!meal} title="Change this meal" subtitle={meal ? `Replacing “${meal.title}”` : undefined} onClose={onClose}>
      {meal && <ChangeMealForm key={meal._id} plan={plan} meal={meal} onDone={onClose} />}
    </BottomSheet>
  );
}

function ChangeMealForm({ plan, meal, onDone }: { plan: MealPlan; meal: Meal; onDone: () => void }) {
  const theme = useTheme();
  const { refreshUser } = useAuth();
  const change = useChangeMeal(plan._id);
  const [request, setRequest] = useState('');
  const [avoid, setAvoid] = useState<string[]>([]);
  const [remember, setRemember] = useState(true);
  const ingredients = [...new Set(meal.ingredients.map((i) => i.name.toLowerCase()))];
  const toggle = (name: string) => setAvoid((a) => (a.includes(name) ? a.filter((x) => x !== name) : [...a, name]));
  // The request can be just the tapped ingredients
  const text = request.trim() || (avoid.length ? `I don't like ${avoid.join(', ')}.` : '');

  const submit = () => change.mutate({ mealId: meal._id, request: text, avoid, remember, revision: plan.__v }, {
    onSuccess: () => { void refreshUser(); onDone(); },
    onError: (e) => showAlert('Couldn’t change this meal', e.message),
  });

  return (
    <View style={{ gap: Spacing.three }}>
      <Input label="What would you like instead?" placeholder="e.g. I don’t like potato, use egg" value={request} onChangeText={setRequest} multiline maxLength={300} />
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="smallBold">Tap anything you don’t like</ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {ingredients.map((name) => <Chip key={name} label={name} selected={avoid.includes(name)} onPress={() => toggle(name)} />)}
        </View>
      </View>
      {avoid.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <ThemedText type="small" style={{ flex: 1 }}>Avoid {avoid.join(', ')} in future meals too</ThemedText>
          <Switch value={remember} onValueChange={setRemember} trackColor={{ true: theme.tint, false: theme.backgroundSelected }} thumbColor="#ffffff" />
        </View>
      )}
      <Button title="Change meal" icon="swap-horizontal-outline" onPress={submit} loading={change.isPending} disabled={text.length < 2} />
      {change.isPending && <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Creating a new meal, about 10–20 seconds…</ThemedText>}
    </View>
  );
}
