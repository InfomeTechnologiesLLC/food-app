import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { markTutorialSeen } from '@/lib/tutorial';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const SLIDES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'home-outline', title: 'Welcome to MealMind', body: 'The Today tab shows your pantry, your meals and workout for today, and a health check that tells you what to do next.' },
  { icon: 'restaurant-outline', title: 'Plan meals from what you have', body: 'In the Meals tab, create a plan that fits your diet and allergies. Scan groceries or a receipt to keep your pantry up to date.' },
  { icon: 'checkmark-done-outline', title: 'Mark meals as eaten', body: 'Tap a meal to mark it eaten. It is saved to your food history and the ingredients are taken out of your pantry. You can undo it any time.' },
  { icon: 'barbell-outline', title: 'Add exercise (optional)', body: 'In the Exercise tab, set up your training days and create a workout plan. Log your sets as you go. Everything saves automatically, even offline.' },
  { icon: 'trending-up-outline', title: 'See if you are on track', body: 'Log your weight about once a week. Under Profile > Progress & tracking you can see your meals, workouts and weight trend, with clear next steps.' },
  { icon: 'notifications-outline', title: 'Get gentle reminders', body: 'MealMind can remind you to log your meals, do your workout and weigh in. Change the times or turn them off under Profile > Notifications.' },
];

/** Swipeable intro. Shown once after sign-in, and again from Profile > How it works. */
export default function TutorialScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const pageWidth = Math.min(width, MaxContentWidth);

  const finish = () => {
    if (user) markTutorialSeen(user._id);
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const next = () => (last ? finish() : list.current?.scrollToIndex({ index: index + 1, animated: true }));
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth));

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, width: pageWidth, alignSelf: 'center' }} edges={['top', 'bottom']}>
        <View style={styles.top}>
          {!last && (
            <Pressable accessibilityRole="button" accessibilityLabel="Skip tutorial" onPress={finish} hitSlop={12}>
              <ThemedText themeColor="textSecondary" style={{ fontWeight: 600 }}>Skip</ThemedText>
            </Pressable>
          )}
        </View>
        <FlatList
          ref={list}
          data={SLIDES}
          keyExtractor={(s) => s.title}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width: pageWidth }]}>
              <View style={[styles.iconTile, { backgroundColor: `${theme.tint}26` }]}>
                <Ionicons name={item.icon} size={56} color={theme.tint} />
              </View>
              <ThemedText type="subtitle" style={{ textAlign: 'center' }}>{item.title}</ThemedText>
              <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>{item.body}</ThemedText>
            </View>
          )}
        />
        <View style={styles.bottom}>
          <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
            {SLIDES.map((s, i) => (
              <View key={s.title} style={[styles.dot, { backgroundColor: i === index ? theme.tint : theme.backgroundSelected }]} />
            ))}
          </View>
          <Button title={last ? 'Get started' : 'Next'} onPress={next} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  top: { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: Spacing.three },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four },
  iconTile: { width: 112, height: 112, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
  bottom: { gap: Spacing.three, padding: Spacing.three },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
