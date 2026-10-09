import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Brand row at the top of tab screens. Fixed height so the title doesn't shift between tabs. */
export function AppHeader({ title = 'MealMind', right }: { title?: string; right?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <View style={[styles.row, { gap: Spacing.two }]}>
        <Ionicons name="leaf-outline" size={22} color={theme.tint} />
        <ThemedText style={{ fontSize: 18, fontWeight: 700 }}>{title}</ThemedText>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 32, marginTop: Spacing.two },
});
