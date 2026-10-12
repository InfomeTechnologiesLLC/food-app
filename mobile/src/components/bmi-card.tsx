import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { MeasurementsForm } from '@/components/measurements-form';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { calculateBmi } from '@/lib/measurements';

export function BmiCard() {
  const theme = useTheme();
  const { user } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (!user) return null;
  const prefs = user.preferences;
  const bmi = calculateBmi(prefs.heightCm, prefs.weightKg);
  const updated = prefs.weightUpdatedAt ? new Date(prefs.weightUpdatedAt) : null;
  const validUpdated = updated && Number.isFinite(updated.getTime()) ? updated : null;
  const due = !!prefs.weightKg && (!validUpdated || now - validUpdated.getTime() >= 7 * 86_400_000);
  return (
    <>
      <View style={{ gap: Spacing.two, padding: Spacing.three, borderRadius: 20, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.backgroundElement }}>
        <ThemedText type="smallBold">Your body measurements</ThemedText>
        {bmi !== null ? (
          <>
            <ThemedText style={{ fontSize: 24, fontWeight: 700 }}>BMI {bmi.toFixed(1)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{prefs.weightKg} kg · {prefs.heightCm} cm</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">BMI is a rough screening measure and does not distinguish muscle from fat.</ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">Add your height and weight to see your BMI.</ThemedText>
        )}
        {validUpdated && <ThemedText type="small" themeColor="textSecondary">Weight updated {validUpdated.toLocaleDateString()}</ThemedText>}
        {due && !dismissed && (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="small">Time for your weekly weight check-in?</ThemedText>
            <Pressable onPress={() => setDismissed(true)} hitSlop={8} accessibilityLabel="Dismiss weight check-in">
              <ThemedText type="small" themeColor="tint">Maybe later</ThemedText>
            </Pressable>
          </View>
        )}
        <Button title={bmi === null ? 'Add measurements' : 'Update weight or height'} variant="secondary" onPress={() => setEditing(true)} />
      </View>
      <BottomSheet visible={editing} title="Body measurements" onClose={() => setEditing(false)}>
        {editing && <MeasurementsForm initial={prefs} onSaved={() => { setEditing(false); setDismissed(false); }} />}
      </BottomSheet>
    </>
  );
}
