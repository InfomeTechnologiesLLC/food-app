import { View } from 'react-native';

import { PreferencesForm } from '@/components/preferences-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function OnboardingScreen() {
  const { user, updatePreferences, updateBody } = useAuth();
  if (!user) return null;

  return (
    <Screen>
      <View style={{ gap: Spacing.one, paddingTop: Spacing.three }}>
        <ThemedText type="subtitle">Tell us how you eat</ThemedText>
        <ThemedText themeColor="textSecondary">Meal plans are for you, with one serving per meal. You can change these preferences anytime.</ThemedText>
      </View>
      <PreferencesForm initial={user.preferences} body={user.body} submitLabel="Continue" onSubmit={async (prefs, body) => { await updateBody(body); await updatePreferences(prefs); }} />
    </Screen>
  );
}
