import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { MeasurementsForm } from '@/components/measurements-form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { calculateBmi } from '@/lib/measurements';

export function BmiCard() {
  const theme = useTheme();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  if (!user) return null;
  const prefs = user.preferences;
  const bmi = calculateBmi(prefs.heightCm, prefs.weightKg);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={bmi === null ? 'Add measurements to calculate BMI' : `BMI ${bmi.toFixed(1)}. Edit measurements`}
        onPress={() => setEditing(true)}
        style={({ pressed }) => ({
          flex: 1, justifyContent: 'space-between', gap: Spacing.two,
          padding: Spacing.three, borderRadius: 20, borderWidth: 1,
          borderColor: theme.border, backgroundColor: theme.backgroundElement,
          opacity: pressed ? 0.8 : 1,
        })}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <ThemedText style={{ fontSize: 24, lineHeight: 30, fontWeight: 700 }}>
            {bmi === null ? '–' : bmi.toFixed(1)}
          </ThemedText>
          <Ionicons name="body-outline" size={20} color={theme.textSecondary} />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
          {bmi === null ? 'BMI · Add measurements' : 'Body mass index'}
        </ThemedText>
      </Pressable>
      <BottomSheet visible={editing} title="Body measurements" onClose={() => setEditing(false)}>
        {editing && <MeasurementsForm initial={prefs} onSaved={() => { setEditing(false); }} />}
      </BottomSheet>
    </>
  );
}
