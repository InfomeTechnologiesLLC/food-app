import { useState } from 'react';
import { View } from 'react-native';

import { CuisinePicker, DislikesInput } from '@/components/food-prefs-inputs';
import { MeasurementInputs } from '@/components/measurements-form';
import { ProfileInputs, profileDraft } from '@/components/profile-inputs';
import { parseMeasurements, parseProfile } from '@/lib/measurements';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipGroup, Input, Section, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { BodyMeasurements, Budget, Diet, Goal, Preferences } from '@/lib/types';

export const DIETS: Diet[] = ['non_vegetarian', 'vegetarian', 'eggetarian', 'vegan', 'pescatarian', 'keto', 'halal', 'kosher', 'none'];
/** "non_vegetarian" → "Non-vegetarian", "none" → "No restrictions" */
export const dietLabel = (d: Diet) => (d === 'none' ? 'No restrictions' : d === 'non_vegetarian' ? 'Non-vegetarian' : d === 'eggetarian' ? 'Eggetarian' : humanize(d));
export const GOALS: Goal[] = ['balanced', 'weight_loss', 'muscle_gain'];
export const BUDGETS: Budget[] = ['low', 'medium', 'high'];
export const COMMON_ALLERGIES = ['peanuts', 'tree nuts', 'milk', 'eggs', 'gluten', 'soy', 'fish', 'shellfish', 'sesame'];

export function PreferencesForm({
  initial, body, submitLabel, onSubmit,
}: {
  initial: Preferences;
  body: BodyMeasurements;
  submitLabel: string;
  onSubmit: (prefs: Preferences, body: BodyMeasurements) => Promise<void>;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [height, setHeight] = useState(body.heightCm?.toString() ?? "");
    const [weight, setWeight] = useState(body.weightKg?.toString() ?? "");
  const [profile, setProfile] = useState(() => profileDraft(body));
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
      // No target weight here: the coach sets a healthy one from height, weight and goal
      await onSubmit(prefs, { ...parseMeasurements(height, weight), ...parseProfile(profile) });
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
        <ChipGroup options={DIETS} value={prefs.diet} onChange={(v) => set('diet', v)} format={dietLabel} />
      </Section>

      <Section title="Food from which country?">
        <ThemedText type="small" themeColor="textSecondary">Meal plans use everyday home cooking from here.</ThemedText>
        <CuisinePicker value={prefs.cuisine ?? null} onChange={(v) => set('cuisine', v)} />
      </Section>

      <Section title="Foods you don’t like (optional)">
        <DislikesInput value={prefs.dislikes ?? []} onChange={(v) => set('dislikes', v)} />
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

      <Section title="Nutrition goal">
        <ChipGroup options={GOALS} value={prefs.goal} onChange={(v) => set('goal', v)} format={humanize} />
      </Section>

      <Section title="Budget">
        <ChipGroup options={BUDGETS} value={prefs.budget} onChange={(v) => set('budget', v)} format={humanize} />
      </Section>

      <Section title="Your body and goal">
        <ThemedText type="small" themeColor="textSecondary">With these, MealMind works out your daily calories, protein, carbs, fat and water, and plans meals to match. Your coach sets a healthy target weight for your goal from your height and weight. You can skip any of them and add them later in Profile.</ThemedText>
        <MeasurementInputs height={height} weight={weight} onHeightChange={setHeight} onWeightChange={setWeight} />
        <ProfileInputs value={profile} onChange={setProfile} showTimeline={false} />
      </Section>

      {error && <ThemedText themeColor="danger">{error}</ThemedText>}
      <Button title={submitLabel} onPress={submit} loading={saving} />
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Meal suggestions are general guidance, not medical or dietary advice.
      </ThemedText>
    </View>
  );
}
