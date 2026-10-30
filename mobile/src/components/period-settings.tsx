import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { ListCard, ListRow, SectionLabel } from '@/components/settings-list';
import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipGroup, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { addDaysLocal } from '@/lib/nutrition-coach';
import { dateLabel, localDate } from '@/lib/plans';
import { untilText, usePeriod, usePeriodActions } from '@/lib/period';

type Sheet = 'exercise' | 'comfort' | 'log' | null;
const EXERCISE = ['light', 'rest'] as const;
const exerciseLabel = (v: (typeof EXERCISE)[number]) => (v === 'light' ? 'Light exercise' : 'Rest');
const COMFORT_IDEAS = ['ginger tea', 'dark chocolate', 'banana', 'dates', 'curd rice', 'warm soup', 'hot water bag'];

/**
 * Profile → Period (female profiles only). Turning it on lets the app predict the next period,
 * remind her two days before, ask about pain on period days and show her comfort foods.
 */
export function PeriodSettings() {
  const theme = useTheme();
  const { user } = useAuth();
  const today = localDate();
  const period = usePeriod(today);
  const actions = usePeriodActions(today);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [foods, setFoods] = useState<string[]>([]);
  const [food, setFood] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState('');
  if (user?.body.sex !== 'female' || !period.data) return null;
  const p = period.data;
  const fail = (e: Error) => showAlert('Couldn’t save', e.message);
  const close = () => setSheet(null);

  const toggle = (on: boolean) => actions.settings.mutate({ tracking: on }, { onError: fail });
  const addFood = () => {
    const items = food.split(',').map((f) => f.trim().toLowerCase()).filter((f) => f.length > 0 && f.length <= 60);
    if (items.length) setFoods((list) => [...new Set([...list, ...items])].slice(0, 20));
    setFood('');
  };
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
  const saveLog = () => {
    if (!isDate(start) || (end && !isDate(end))) return showAlert('Check the dates', 'Use the format YYYY-MM-DD, e.g. 2026-10-29.');
    actions.log.mutate({ startDate: start, endDate: end || null }, { onSuccess: close, onError: fail });
  };
  const next = p.status.nextStart;

  return (
    <>
      <SectionLabel>Period</SectionLabel>
      <ListCard>
        <ListRow icon="flower-outline" iconColor={theme.period} label="Track my period"
          subtitle={p.settings.tracking ? undefined : 'Reminders, pain check-ins and comfort foods'}
          right={<Switch accessibilityLabel="Track my period" value={p.settings.tracking} onValueChange={toggle} disabled={actions.settings.isPending} trackColor={{ true: theme.period, false: theme.backgroundSelected }} thumbColor="#ffffff" />} />
        {p.settings.tracking && (
          <>
            <ListRow icon="calendar-outline" label="Log a period"
              value={p.status.onPeriod ? `Day ${p.status.dayOfPeriod}` : next ? `Next ${untilText(p.status.daysUntilNext!)}` : 'Add the last one'}
              onPress={() => { setStart(today); setEnd(''); setSheet('log'); }} />
            <ListRow icon="walk-outline" label="On period days" value={exerciseLabel(p.settings.exercise)} onPress={() => setSheet('exercise')} />
            <ListRow icon="heart-outline" label="Comfort foods" value={p.settings.comfortFoods.length ? `${p.settings.comfortFoods.length} saved` : 'Add yours'}
              onPress={() => { setFoods(p.settings.comfortFoods); setFood(''); setSheet('comfort'); }} />
          </>
        )}
      </ListCard>
      {p.settings.tracking && next && (
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
          Your cycle is about {p.status.averageCycle} days and your period about {p.status.averagePeriod} days. Next expected {dateLabel(next)}. You’ll get a reminder two days before (installed app only). Only you can see this.
        </ThemedText>
      )}

      <BottomSheet visible={sheet === 'exercise'} title="On period days" subtitle="What should the Exercise tab do?" onClose={close}>
        <ChipGroup options={EXERCISE} value={p.settings.exercise} format={exerciseLabel} fill
          onChange={(v) => actions.settings.mutate({ exercise: v }, { onSuccess: close, onError: fail })} />
        <ThemedText type="small" themeColor="textSecondary">
          Light exercise: a short walk and gentle movements instead of the planned workout. Rest: no workout, and it won’t count as missed.
        </ThemedText>
      </BottomSheet>

      <BottomSheet visible={sheet === 'comfort'} title="Comfort foods" subtitle="Shown on period days, and added to meal plans where they fit" onClose={close}>
        <View style={styles.chips}>
          {[...new Set([...foods, ...COMFORT_IDEAS])].map((f) => (
            <Chip key={f} label={foods.includes(f) ? `${f}  ✓` : f} selected={foods.includes(f)}
              onPress={() => setFoods((list) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]))} />
          ))}
        </View>
        <Input placeholder="Add your own, e.g. hot chocolate" value={food} onChangeText={setFood} onSubmitEditing={addFood} onBlur={addFood} returnKeyType="done" maxLength={60} />
        <Button title="Save" loading={actions.settings.isPending} onPress={() => actions.settings.mutate({ comfortFoods: foods }, { onSuccess: close, onError: fail })} />
      </BottomSheet>

      <BottomSheet visible={sheet === 'log'} title="Log a period" subtitle="The app uses these dates to predict the next one" onClose={close}>
        <ThemedText type="smallBold">First day</ThemedText>
        <View style={styles.chips}>
          {[0, 1, 2, 3].map((n) => {
            const d = addDaysLocal(today, -n);
            return <Chip key={d} label={n === 0 ? 'Today' : n === 1 ? 'Yesterday' : dateLabel(d)} selected={start === d} onPress={() => setStart(d)} />;
          })}
        </View>
        <Input label="Or type a date (YYYY-MM-DD)" value={start} onChangeText={setStart} maxLength={10} />
        <Input label="Last day (optional)" placeholder="Leave empty if it hasn’t ended" value={end} onChangeText={setEnd} maxLength={10} />
        <Button title="Save period" loading={actions.log.isPending} onPress={saveLog} />
        {p.logs.length > 0 && (
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold">Logged periods</ThemedText>
            {p.logs.slice(0, 6).map((l) => (
              <View key={l._id} style={[styles.log, { borderColor: theme.border }]}>
                <Ionicons name="flower" size={16} color={theme.period} />
                <ThemedText type="small" style={{ flex: 1 }}>{dateLabel(l.startDate)}{l.endDate ? ` – ${dateLabel(l.endDate)}` : ' · ongoing'}</ThemedText>
                {!l.endDate && l.startDate <= today && (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => actions.update.mutate({ id: l._id, startDate: l.startDate, endDate: today < addDaysLocal(l.startDate, 14) ? today : addDaysLocal(l.startDate, 6) }, { onError: fail })}>
                    <ThemedText type="smallBold" themeColor="tint">Ended</ThemedText>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Delete this period" hitSlop={8}
                  onPress={() => showAlert('Delete this period?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => actions.remove.mutate(l._id, { onError: fail }) }])}>
                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  log: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
});
