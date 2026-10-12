import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { BUDGETS, COMMON_ALLERGIES, DIETS, GOALS } from '@/components/preferences-form';
import { MeasurementsForm } from '@/components/measurements-form';
import { ReminderSettings } from '@/components/reminder-settings';
import { ListCard, ListRow, SectionLabel } from '@/components/settings-list';
import { Screen } from '@/components/screen';
import { showAlert } from '@/components/themed-alert';
import { ThemeSettings } from '@/components/theme-settings';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipGroup, Input, humanize } from '@/components/ui';
import { UsageCard } from '@/components/usage-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import type { Preferences } from '@/lib/types';

type Field = 'diet' | 'allergies' | 'goal' | 'measurements' | 'budget';

const SHEET_TITLES: Record<Field, string> = {
  diet: 'Diet',
  allergies: 'Allergies',
  goal: 'Health goal',
  measurements: 'Body measurements',
  budget: 'Budget',
};

/** "alex.smith@x.com" → "Alex" */
const nameFromEmail = (email: string) => humanize(email.split('@')[0].split(/[._\-+0-9]/)[0] || email.split('@')[0]);

function summarizeAllergies(allergies: string[]) {
  if (allergies.length === 0) return 'None';
  if (allergies.length === 1) return humanize(allergies[0]);
  return `${humanize(allergies[0])} +${allergies.length - 1}`;
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, updatePreferences, signOut } = useAuth();
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [customAllergy, setCustomAllergy] = useState('');
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  const prefs = user.preferences;
  const name = nameFromEmail(user.email);

  const open = (field: Field) => {
    setDraft(prefs);
    setCustomAllergy('');
    setEditing(field);
  };
  const close = () => setEditing(null);
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setDraft((d) => d && { ...d, [key]: value });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      if (!editing || editing === "measurements") return;
      await updatePreferences({ [editing]: draft[editing] });
      close();
    } catch (e) {
      showAlert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAllergy = (a: string) =>
    draft && set('allergies', draft.allergies.includes(a) ? draft.allergies.filter((x) => x !== a) : [...draft.allergies, a]);
  const addCustomAllergy = () => {
    const a = customAllergy.trim().toLowerCase();
    if (draft && a && !draft.allergies.includes(a)) set('allergies', [...draft.allergies, a]);
    setCustomAllergy('');
  };

  return (
    <Screen edges={['bottom']}>
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: `${theme.tint}26` }]}>
          <ThemedText style={[styles.avatarText, { color: theme.tint }]}>{name.charAt(0).toUpperCase()}</ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.hello} numberOfLines={1}>Hello, {name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{user.email}</ThemedText>
        </View>
      </View>

      <UsageCard user={user} />

      <SectionLabel>Preferences</SectionLabel>
      <ListCard>
        <ListRow icon="leaf-outline" iconColor={theme.tint} label="Diet" value={prefs.diet === 'none' ? 'No restrictions' : humanize(prefs.diet)} onPress={() => open('diet')} />
        <ListRow icon="shield-outline" iconColor={theme.danger} label="Allergies" value={summarizeAllergies(prefs.allergies)} onPress={() => open('allergies')} />
        <ListRow icon="radio-button-on-outline" iconColor={theme.warning} label="Health goal" value={humanize(prefs.goal)} onPress={() => open('goal')} />
        <ListRow icon="body-outline" label="Body measurements" value={[prefs.heightCm ? `${prefs.heightCm} cm` : null, prefs.weightKg ? `${prefs.weightKg} kg` : null].filter(Boolean).join(' · ') || 'Add height and weight'} onPress={() => open('measurements')} />
        <ListRow icon="card-outline" label="Budget" value={humanize(prefs.budget)} onPress={() => open('budget')} />
      </ListCard>

      <ReminderSettings />

      <ThemeSettings />

      <View style={styles.footer}>
        {user.plan === 'free' ? (
          <Pressable onPress={() => router.push('/upgrade')} hitSlop={8} style={styles.footerLink}>
            <ThemedText style={{ color: theme.tint, fontWeight: 700 }}>Upgrade plan</ThemedText>
            <Ionicons name="chevron-forward" size={16} color={theme.tint} />
          </Pressable>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">{humanize(user.plan)} plan</ThemedText>
        )}
        <Pressable
          onPress={() => showAlert('Log out?', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
          ])}
          hitSlop={8}>
          <ThemedText style={{ color: theme.danger, fontWeight: 700 }}>Log out</ThemedText>
        </Pressable>
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
        Meal suggestions are general guidance, not medical or dietary advice.
      </ThemedText>

      <BottomSheet
        visible={!!editing}
        title={editing ? SHEET_TITLES[editing] : ''}
        subtitle={editing === 'allergies' ? 'Choose all that apply' : undefined}
        onClose={close}>
        {draft && editing === 'diet' && (
          <ChipGroup options={DIETS} value={draft.diet} onChange={(v) => set('diet', v)} format={(d) => (d === 'none' ? 'No restrictions' : humanize(d))} />
        )}
        {draft && editing === 'allergies' && (
          <>
            <View style={styles.chips}>
              {[...new Set([...COMMON_ALLERGIES, ...draft.allergies])].map((a) => (
                <Chip key={a} label={humanize(a)} selected={draft.allergies.includes(a)} onPress={() => toggleAllergy(a)} />
              ))}
            </View>
            <Input
              placeholder="Add another allergy"
              value={customAllergy}
              onChangeText={setCustomAllergy}
              onSubmitEditing={addCustomAllergy}
              returnKeyType="done"
            />
          </>
        )}
        {draft && editing === 'goal' && (
          <ChipGroup options={GOALS} value={draft.goal} onChange={(v) => set('goal', v)} format={humanize} />
        )}
        {editing === 'measurements' && <MeasurementsForm initial={prefs} onSaved={close} />}
        {draft && editing === 'budget' && (
          <ChipGroup options={BUDGETS} value={draft.budget} onChange={(v) => set('budget', v)} format={humanize} />
        )}
        {editing !== "measurements" && <Button title="Save" onPress={save} loading={saving} />}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  avatar: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, lineHeight: 32, fontWeight: 700 },
  hello: { fontSize: 22, lineHeight: 28, fontWeight: 700 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  footerLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  disclaimer: { textAlign: 'center', fontSize: 12, marginTop: Spacing.two },
});
