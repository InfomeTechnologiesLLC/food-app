import { View } from 'react-native';

import { PreferencesForm } from '@/components/preferences-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useLogWeight } from '@/lib/weight';

export default function OnboardingScreen() {
    const { user, updatePreferences, updateBody } = useAuth();
  const logWeight = useLogWeight();
  if (!user) return null;

  return (
    <Screen>
      <View style={{ gap: Spacing.one, paddingTop: Spacing.three }}>
        <ThemedText type="subtitle">Tell us how you eat</ThemedText>
        <ThemedText themeColor="textSecondary">Meal plans are for you, with one serving per meal. You can change these preferences anytime.</ThemedText>
           </View>
      <PreferencesForm initial={user.preferences} body={user.body} submitLabel="Continue" onSubmit={async (prefs, body) => {
        await updateBody(body);
        // Also save it as the first weigh-in, so the weight trend starts from day one
        if (body.weightKg) await logWeight.mutateAsync({ weightKg: body.weightKg });
        // Last: this marks the account as onboarded and moves on to the app
        await updatePreferences(prefs);
      }} />
    </Screen>
  );
}
