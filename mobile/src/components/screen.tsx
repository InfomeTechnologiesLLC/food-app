import { ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** Safe-area aware, scrollable page wrapper used by every screen. Screens under a header (tabs layout or a stack header) pass `edges={['bottom']}` since the header owns the top inset. */
export function Screen({
  children, scroll = true, edges = ['top', 'bottom'], ...props
}: ScrollViewProps & { scroll?: boolean; edges?: Edge[] }) {
  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" {...props}>
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
});
