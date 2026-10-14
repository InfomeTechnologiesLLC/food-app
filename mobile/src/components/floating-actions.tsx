import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

/** Overlay above the tab bar; action bubbles never reserve scroll-content space. */
export function FloatingActions({ children }: PropsWithChildren) {
  return (
    <SafeAreaView edges={['right']} pointerEvents="box-none" style={styles.anchor}>
      <View style={styles.stack}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: 0, bottom: 0 },
  stack: { alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
});
