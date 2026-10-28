import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { parseMeasurements } from '@/lib/measurements';
import { useLogWeight } from '@/lib/weight';
import type { BodyMeasurements } from '@/lib/types';


export function MeasurementInputs({ height, weight, target, onHeightChange, onWeightChange, onTargetChange }: {
  height: string;
  weight: string;
  onHeightChange: (value: string) => void;
    onWeightChange: (value: string) => void;
  /** Shown only when both are passed */
  target?: string;
  onTargetChange?: (value: string) => void;
}) {
  return (
    <View style={{ gap: Spacing.two }}>
      <Input label="Height (cm)" accessibilityLabel="Height in centimetres" placeholder="e.g. 170" keyboardType="decimal-pad" value={height} onChangeText={onHeightChange} maxLength={6} />
           <Input label="Current weight (kg)" accessibilityLabel="Weight in kilograms" placeholder="e.g. 65" keyboardType="decimal-pad" value={weight} onChangeText={onWeightChange} maxLength={6} />
      {target !== undefined && onTargetChange && (
        <Input label="Target weight (kg, optional)" accessibilityLabel="Target weight in kilograms" placeholder="e.g. 70" keyboardType="decimal-pad" value={target} onChangeText={onTargetChange} maxLength={6} />
      )}
    </View>
  );
}

export function MeasurementsForm({ initial, onSaved }: { initial: BodyMeasurements; onSaved: () => void }) {
  const { updateBody } = useAuth();
  const logWeight = useLogWeight();
  const [height, setHeight] = useState(initial.heightCm?.toString() ?? '');
   const [weight, setWeight] = useState(initial.weightKg?.toString() ?? '');
  const [target, setTarget] = useState(initial.targetWeightKg?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
        try {
      const next = parseMeasurements(height, weight, target);
      await updateBody(next);
      // Keep the weight history in step with the weight shown on the profile
      if (next.weightKg !== null && next.weightKg !== initial.weightKg) await logWeight.mutateAsync({ weightKg: next.weightKg });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
        <>
      <ThemedText type="small" themeColor="textSecondary">Keep your weight up to date. Height and target can be edited anytime. Clear a field to remove it.</ThemedText>
      <MeasurementInputs height={height} weight={weight} target={target} onHeightChange={setHeight} onWeightChange={setWeight} onTargetChange={setTarget} />
      {error && <ThemedText themeColor="danger">{error}</ThemedText>}
      <Button title="Save measurements" onPress={save} loading={saving} />
    </>
  );
}
