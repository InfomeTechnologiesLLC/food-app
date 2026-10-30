import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, SectionList, View } from 'react-native';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { MealCard } from '@/components/meal-card';
import { Button } from '@/components/ui';
import { showAlert } from '@/components/themed-alert';
import { useFoodHistory, useUndoHistory, historyMeal } from '@/lib/history';
import { useCalendarDate } from '@/hooks/use-calendar-date';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function FoodHistoryScreen() {
  const date = useCalendarDate();
  const [todayOnly, setTodayOnly] = useState(false);
  const history = useFoodHistory(todayOnly ? date : undefined);
  const undo = useUndoHistory();
  const pages = history.data?.pages ?? [];
  const entries = pages.flatMap((page) => page.entries);
  const totals = Object.assign({}, ...pages.map((page) => page.totals));
  const dates = [...new Set(entries.map((entry) => entry.date))];
  const undoMeal = (id: string) => showAlert('Undo eaten meal?', 'This removes the meal from your eaten totals and restores only the pantry stock originally deducted. It will not restore a removed plan.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Undo', onPress: () => undo.mutate(id) },
  ]);

  return (
    <Screen scroll={false} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Food history' }} />
      <SectionList
        sections={dates.map((date) => ({ key: date, date, data: entries.filter((entry) => entry.date === date) }))}
        keyExtractor={(entry) => entry._id}
        stickySectionHeadersEnabled={false}
        refreshing={history.isRefetching}
        onRefresh={() => history.refetch()}
        contentContainerStyle={{ padding: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, paddingBottom: Spacing.three }}>
            <Button title={todayOnly ? 'Show all dates' : 'Show today only'} variant="secondary" onPress={() => setTodayOnly(!todayOnly)} />
            {history.isLoading && <ActivityIndicator />}
            {history.error && <><ThemedText themeColor="danger">{history.error.message}</ThemedText><Button title="Try again" onPress={() => history.refetch()} /></>}
            {undo.error && <ThemedText themeColor="danger">{undo.error.message}</ThemedText>}
            {history.isSuccess && entries.length === 0 && <ThemedText themeColor="textSecondary">No eaten meals {todayOnly ? 'today' : 'yet'}. Mark a meal as eaten in your plan to record it here.</ThemedText>}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ gap: Spacing.one, paddingBottom: Spacing.two }}>
            <ThemedText type="smallBold">{new Date(`${section.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {totals[section.date]?.meals ?? 0} {(totals[section.date]?.meals ?? 0) === 1 ? 'meal' : 'meals'} · ~{Math.round(totals[section.date]?.calories ?? 0)} kcal · Protein {Math.round(totals[section.date]?.proteinGrams ?? 0)} g · Carbs {Math.round(totals[section.date]?.carbsGrams ?? 0)} g · Fat {Math.round(totals[section.date]?.fatGrams ?? 0)} g
            </ThemedText>
          </View>
        )}
        renderItem={({ item: entry }) => (
          <View style={{ gap: Spacing.one, paddingBottom: Spacing.three }}>
            <MealCard meal={historyMeal(entry)} onToggleEaten={() => undoMeal(entry._id)} toggling={undo.isPending && undo.variables === entry._id} actionDisabled={undo.isPending} />
            <ThemedText type="small" themeColor="textSecondary">{entry.sourcePlanTitle} · Logged {new Date(entry.recordedAt).toLocaleString()}</ThemedText>
          </View>
        )}
        ListFooterComponent={history.hasNextPage ? <Button title="Load more" variant="secondary" loading={history.isFetchingNextPage} onPress={() => history.fetchNextPage()} /> : null}
      />
    </Screen>
  );
}
