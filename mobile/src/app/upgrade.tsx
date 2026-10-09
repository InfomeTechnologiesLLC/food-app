import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TIERS: readonly {
  id: 'free' | 'plus' | 'family';
  name: string;
  tagline: string;
  icon: IconName;
  features: readonly { label: string; icon: IconName }[];
}[] = [
  {
    id: 'free', name: 'Free', tagline: 'A fresh start for your kitchen.', icon: 'leaf-outline',
    features: [
      { label: '5 scans a month', icon: 'scan-outline' },
      { label: '3 meal plans a month', icon: 'restaurant-outline' },
      { label: 'Expiry reminders', icon: 'time-outline' },
      { label: 'Diet and allergy settings', icon: 'shield-checkmark-outline' },
    ],
  },
  {
    id: 'plus', name: 'Plus', tagline: 'No limits on scanning or planning.', icon: 'sparkles-outline',
    features: [
      { label: 'Unlimited scans', icon: 'scan-outline' },
      { label: 'Unlimited meal plans', icon: 'restaurant-outline' },
      { label: 'Expiry reminders', icon: 'time-outline' },
      { label: 'Multiple diet profiles (soon)', icon: 'people-outline' },
    ],
  },
  {
    id: 'family', name: 'Family', tagline: 'One pantry for the whole household.', icon: 'home-outline',
    features: [
      { label: 'Everything in Plus', icon: 'sparkles-outline' },
      { label: 'Shared pantry and shopping lists (soon)', icon: 'cart-outline' },
      { label: 'Up to 6 household members (soon)', icon: 'person-add-outline' },
    ],
  },
];

export default function UpgradeScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState(() => TIERS.find((t) => t.id === user?.plan)?.id ?? 'free');
  const tier = TIERS.find((t) => t.id === selectedId) ?? TIERS[0];
  const current = user?.plan === tier.id;

  return (
    <Screen scroll={false} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView type="backgroundElement" style={styles.segmented}>
          {TIERS.map((t) => {
            const selected = t.id === selectedId;
            return (
              <Pressable
                key={t.id}
                onPress={() => setSelectedId(t.id)}
                style={[styles.segment, selected && { backgroundColor: theme.background }]}>
                <ThemedText type={selected ? 'smallBold' : 'small'} themeColor={selected ? 'text' : 'textSecondary'}>
                  {t.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </ThemedView>

        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: `${theme.tint}22` }]}>
            <Ionicons name={tier.icon} size={36} color={theme.tint} />
          </View>
          <ThemedText style={styles.heroTitle}>MealMind {tier.name}</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{tier.tagline}</ThemedText>
          <View style={styles.status}>
            <Ionicons name={current ? 'checkmark' : 'time-outline'} size={14} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">{current ? 'Your current plan' : 'Coming soon'}</ThemedText>
          </View>
        </View>

        <View>
          {tier.features.map((f, i) => (
            <View
              key={f.label}
              style={[styles.feature, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <ThemedView type="backgroundElement" style={styles.featureIcon}>
                <Ionicons name={f.icon} size={20} color={theme.tint} />
              </ThemedView>
              <ThemedText style={{ flex: 1, fontWeight: 600 }}>{f.label}</ThemedText>
            </View>
          ))}
        </View>

        {!current && (
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Paid plans are coming soon. Prices will be set after testing with early users.
          </ThemedText>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <View
          style={[
            styles.cta,
            current ? { backgroundColor: theme.tint } : { backgroundColor: theme.backgroundElement },
          ]}>
          <Ionicons name={current ? 'checkmark-circle-outline' : 'time-outline'} size={20} color={current ? theme.tintText : theme.textSecondary} />
          <ThemedText style={{ fontWeight: 600, color: current ? theme.tintText : theme.textSecondary }}>
            {current ? 'Your current plan' : 'Coming soon'}
          </ThemedText>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.four, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  segmented: { flexDirection: 'row', padding: Spacing.one, borderRadius: 14 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two + 2, borderRadius: 10 },
  hero: { alignItems: 'center', gap: Spacing.two },
  heroIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
  heroTitle: { fontSize: 26, lineHeight: 32, fontWeight: 700, textAlign: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  feature: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  featureIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  cta: { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
