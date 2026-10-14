import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** Own the Android status-bar inset once, without the native toolbar's extra padding. */
export function WorkoutHistoryHeader() {
  const theme = useTheme();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: theme.background }}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <ThemedText numberOfLines={1} style={styles.title}>Workout history</ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, marginLeft: 16, marginRight: 16, fontSize: 20, fontWeight: '600' },
});
