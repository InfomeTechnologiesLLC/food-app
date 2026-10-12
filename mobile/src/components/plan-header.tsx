import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** Own the Android top inset once, without the native toolbar's extra spacing. */
export function PlanHeader({ title, onBack, canGoBack }: { title: string; onBack: () => void; canGoBack: boolean }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: theme.background }}>
      <View style={styles.row}>
        {canGoBack && (
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.back}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
        )}
        <ThemedText numberOfLines={1} style={styles.title}>{title}</ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, marginHorizontal: 12, fontSize: 18, fontWeight: '700' },
});
