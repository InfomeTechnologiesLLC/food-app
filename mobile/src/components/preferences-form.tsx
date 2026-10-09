import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipGroup, Input, Section, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Budget, Diet, Goal, Preferences } from '@/lib/types';

export const DIETS: Diet[] = ['none', 'vegetarian', 'vegan', 'pescatarian', 'keto', 'halal', 'kosher'];
export const GOALS: Goal[] = ['balanced', 'weight_loss', 'muscle_gain', 'budget'];
export const BUDGETS: Budget[] = ['low', 'medium', 'high'];
export const SERVINGS = [1, 2, 3, 4, 5, 6] as const;
export const COMMON_ALLERGIES = ['peanuts', 'tree nuts', 'milk', 'eggs', 'gluten', 'soy', 'fish', 'shellfish', 'sesame'];

export function PreferencesForm({
  initial, submitLabel, onSubmit,
}: {
  initial: Preferences;
  submitLabel: string;
  onSubmit: (prefs: Preferences) => Promise<void>;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [customAllergy, setCustomAllergy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  const toggleAllergy = (a: string) =>
    set('allergies', prefs.allergies.includes(a) ? prefs.allergies.filter((x) => x !== a) : [...prefs.allergies, a]);

  const addCustomAllergy = () => {
    const a = customAllergy.trim().toLowerCase();
    if (a && !prefs.allergies.includes(a)) set('allergies', [...prefs.allergies, a]);
    setCustomAllergy('');
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(prefs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const allergyOptions = [...new Set([...COMMON_ALLERGIES, ...prefs.allergies])];

  return (
    <View style={{ gap: Spacing.four }}>
      <Section title="Diet">
        <ChipGroup options={DIETS} value={prefs.diet} onChange={(v) => set('diet', v)} format={humanize} />
      </Section>

      <Section title="Allergies">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {allergyOptions.map((a) => (
            <Chip key={a} label={humanize(a)} selected={prefs.allergies.includes(a)} onPress={() => toggleAllergy(a)} />
          ))}
        </View>
        <Input
          placeholder="Add another allergy"
          value={customAllergy}
          onChangeText={setCustomAllergy}
          onSubmitEditing={addCustomAllergy}
          returnKeyType="done"
        />
      </Section>

      <Section title="Health goal">
        <ChipGroup options={GOALS} value={prefs.goal} onChange={(v) => set('goal', v)} format={humanize} />
      </Section>

      <Section title="Budget">
        <ChipGroup options={BUDGETS} value={prefs.budget} onChange={(v) => set('budget', v)} format={humanize} />
      </Section>

      <Section title="Cooking for">
        <ChipGroup
          options={SERVINGS}
          value={prefs.servings as (typeof SERVINGS)[number]}
          onChange={(v) => set('servings', v)}
          format={(n) => (n === 1 ? '1 person' : `${n} people`)}
        />
      </Section>

      {error && <ThemedText themeColor="danger">{error}</ThemedText>}
      <Button title={submitLabel} onPress={submit} loading={saving} />
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Meal suggestions are general guidance, not medical or dietary advice.
      </ThemedText>
    </View>
  );
}
