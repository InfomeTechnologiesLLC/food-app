import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Modal sheet that slides up from the bottom; tap the backdrop or ✕ to dismiss. */
export function BottomSheet({
  visible, title, subtitle, onClose, children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [layoutReady, setLayoutReady] = useState(false);
  const [ready, setReady] = useState(false);
  const progress = useSharedValue(0);
  const sheetHeight = useSharedValue(windowHeight);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    // Measurement must never reveal the sheet before its first animation frame.
    // Keep opacity and position together on the UI thread, including on reopen.
    opacity: progress.get() > 0 ? 1 : 0,
    transform: [{ translateY: sheetHeight.get() * (1 - progress.get()) }],
  }));
  // Parents may clear their editing state as soon as visibility changes.
  // Keep the last visible content mounted throughout the exit animation.
  const retainedContent = useRef<{ title: string; subtitle?: string; children: React.ReactNode } | null>(null);
  useLayoutEffect(() => {
    if (visible) retainedContent.current = { title, subtitle, children };
  }, [visible, title, subtitle, children]);
  // This snapshot is only read while closing; visible content uses live props.
  // eslint-disable-next-line react-hooks/refs
  const content = visible ? { title, subtitle, children } : retainedContent.current;
  const [previousVisible, setPreviousVisible] = useState(visible);
  if (previousVisible !== visible) {
    setPreviousVisible(visible);
    if (visible) {
      setMounted(true);
    } else if (!ready || !layoutReady) {
      // Nothing has appeared yet, so there is no exit animation to preserve.
      setMounted(false);
      setReady(false);
      setLayoutReady(false);
    }
  }

  useEffect(() => {
    if (!mounted) return;
    // Wait for both native attachment and this opening's content measurement.
    if (!ready || !layoutReady) return;
    let active = true;
    const finishClosing = () => {
      // A completed exit can be queued while the parent reopens the sheet.
      if (!active) return;
      setMounted(false);
      setReady(false);
      setLayoutReady(false);
      retainedContent.current = null;
    };
    progress.set(withTiming(visible ? 1 : 0, {
      duration: visible ? 280 : 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    }, (finished) => {
      if (finished && !visible) scheduleOnRN(finishClosing);
    }));
    return () => {
      active = false;
      cancelAnimation(progress);
    };
  }, [visible, mounted, ready, layoutReady, progress]);

  if (!mounted) return null;

  return (
    // Match the app's edge-to-edge window so opening the dialog doesn't switch
    // Android's bottom system bar and flash the navigation area.
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
      onShow={() => setReady(true)}>
      <View style={styles.container} pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.container} onPress={onClose} />
        </Animated.View>
        <KeyboardAvoidingView style={styles.keyboardContainer} pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            onLayout={(event) => {
              const height = event.nativeEvent.layout.height;
              if (height <= 0) return;
              sheetHeight.set(height);
              setLayoutReady(true);
            }}
            style={[
              styles.sheet,
              { backgroundColor: theme.backgroundElement, paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two },
              sheetStyle,
            ]}>
            <View style={[styles.handle, { backgroundColor: theme.backgroundSelected }]} />
            <View style={styles.header}>
              <ThemedText style={styles.title}>{content?.title}</ThemedText>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [styles.close, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 }]}>
                <Ionicons name="close" size={18} color={theme.text} />
              </Pressable>
            </View>
            {content?.subtitle && <ThemedText type="small" themeColor="textSecondary">{content.subtitle}</ThemedText>}
            {content?.children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardContainer: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.three, paddingTop: Spacing.two,
    gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  title: { fontSize: 22, lineHeight: 28, fontWeight: 700 },
  close: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
