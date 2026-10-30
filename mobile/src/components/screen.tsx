import { useRef } from 'react';
import { ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useScrollToFocusedInput } from '@/lib/keyboard';

/**
 * Safe-area aware, scrollable page wrapper used by every screen. Screens under a header (tabs layout or a stack header) pass `edges={['bottom']}` since the header owns the top inset.
 * While the keyboard is open, the text box being typed in is scrolled above it.
 */
export function Screen({
  children, scroll = true, edges = ['top', 'bottom'], contentContainerStyle, onScroll, ...props
}: ScrollViewProps & { scroll?: boolean; edges?: Edge[] }) {
  const ref = useRef<ScrollView>(null);
  const keyboard = useScrollToFocusedInput(ref);
  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {scroll ? (
          <ScrollView
            ref={ref}
            contentContainerStyle={[styles.content, contentContainerStyle, keyboard.extraBottom ? { paddingBottom: keyboard.extraBottom } : null]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => { keyboard.onScroll(e.nativeEvent.contentOffset.y); onScroll?.(e); }}
            {...props}>
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
