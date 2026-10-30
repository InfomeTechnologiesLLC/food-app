import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { parseMeasurements } from '@/lib/measurements';
import { dateLabel } from '@/lib/plans';
import { useLogWeight, useWeights } from '@/lib/weight';

/** Log today's weight. Logging again on the same day replaces the earlier value. The target weight is set by the coach. */
export function WeightSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} title="Log your weight" subtitle="Weigh in once a week, at the same time of day, for the clearest trend." onClose={onClose}>
      {/* Mounted only while open, so the fields start from the latest saved values each time */}
      {visible && <WeightForm onDone={onClose} />}
    </BottomSheet>
  );
}

function WeightForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const log = useLogWeight();
  const weights = useWeights();
  const [weight, setWeight] = useState(user?.body.weightKg?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { weightKg } = parseMeasurements('', weight);
      if (weightKg === null) throw new Error('Enter your weight in kg.');
      await log.mutateAsync({ weightKg });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const recent = weights.data?.slice(0, 5) ?? [];
  return (
    <>
      <Input label="Weight today (kg)" accessibilityLabel="Weight in kilograms" placeholder="e.g. 68.5" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} maxLength={6} />
      {recent.length > 0 && (
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold">Recent weigh-ins</ThemedText>
          {recent.map((w) => (
            <ThemedText key={w.date} type="small" themeColor="textSecondary">{dateLabel(w.date)} · {w.weightKg} kg</ThemedText>
          ))}
        </View>
      )}
      {error && <ThemedText themeColor="danger">{error}</ThemedText>}
      <Button title="Save" onPress={save} loading={saving} />
    </>
  );
}
