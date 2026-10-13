import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertState { title: string; message?: string; buttons: AlertButton[] }

let show: ((a: AlertState) => void) | null = null;

/** Drop-in for Alert.alert that follows the app theme (the native Android dialog is always white). */
export function showAlert(title: string, message?: string, buttons: AlertButton[] = [{ text: 'OK' }]) {
  show?.({ title, message, buttons });
}

/** Renders alerts from showAlert. Mount once at the root. */
export function AlertHost() {
  const theme = useTheme();
  const [alert, setAlert] = useState<AlertState | null>(null);

  useEffect(() => {
    show = setAlert;
    return () => { show = null; };
  }, []);

  const close = (b?: AlertButton) => {
    setAlert(null);
    b?.onPress?.();
  };
  const cancel = alert?.buttons.find((b) => b.style === 'cancel');

  return (
    <Modal visible={!!alert} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close(cancel)}>
      <Pressable style={styles.backdrop} onPress={() => cancel && close(cancel)}>
        <Pressable style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ThemedText type="smallBold" style={{ fontSize: 18 }}>{alert?.title}</ThemedText>
          {!!alert?.message && <ThemedText themeColor="textSecondary">{alert.message}</ThemedText>}
          <View style={styles.buttons}>
            {alert?.buttons.map((b, i) => {
              const color = b.style === 'destructive' ? theme.danger : b.style === 'cancel' ? theme.text : theme.tintText;
              const bg = b.style === 'destructive' || b.style === 'cancel' ? 'transparent' : theme.tint;
              return (
                <Pressable
                  key={i}
                  onPress={() => close(b)}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: bg, opacity: pressed ? 0.7 : 1, borderColor: b.style === 'destructive' ? theme.danger : theme.backgroundSelected },
                  ]}>
                  <ThemedText style={{ color, fontWeight: 600 }}>{b.text}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.four },
  card: { borderRadius: 20, padding: Spacing.four, gap: Spacing.three, borderWidth: StyleSheet.hairlineWidth },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.two, marginTop: Spacing.one },
  button: { minHeight: 44, paddingHorizontal: Spacing.three, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
