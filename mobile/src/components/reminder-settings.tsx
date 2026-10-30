import { useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { ListCard, ListRow, SectionLabel } from '@/components/settings-list';
import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button, ChipGroup } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { WATER_INTERVALS } from '@/lib/activity-reminders';
import { notificationsSupported } from '@/lib/notifications';
import { ensureNotificationPermission, saveReminderSettings, sendTestReminder, useReminderSettings, type ReminderSettings as ReminderPrefs } from '@/lib/reminders';

const HOURS = [8, 9, 12, 18, 20] as const;

type Kind = 'meals' | 'workout' | 'weighIn';
const ACTIVITY: Record<Kind, {
  label: string; icon: React.ComponentProps<typeof ListRow>['icon']; enabled: 'mealsEnabled' | 'workoutEnabled' | 'weighInEnabled';
  hour: 'mealHour' | 'workoutHour' | 'weighInHour'; hours: readonly number[]; blurb: string; every: string;
}> = {
  meals: { label: 'Meal reminders', icon: 'restaurant-outline', enabled: 'mealsEnabled', hour: 'mealHour', hours: [12, 18, 19, 20, 21], every: 'Daily', blurb: 'A check-in on days you have meals planned. It stops once you have logged them all.' },
  workout: { label: 'Workout reminders', icon: 'barbell-outline', enabled: 'workoutEnabled', hour: 'workoutHour', hours: [6, 7, 12, 17, 18, 19], every: 'On training days', blurb: 'A nudge on your planned training days. It stops once you have logged a workout.' },
  weighIn: { label: 'Weekly weigh-in', icon: 'scale-outline', enabled: 'weighInEnabled', hour: 'weighInHour', hours: [7, 8, 9, 10], every: 'Sundays', blurb: 'A weekly reminder to log your weight, unless you already did this week.' },
};
const formatHour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const WATER_STARTS = [6, 7, 8, 9, 10] as const;
const WATER_ENDS = [18, 19, 20, 21, 22] as const;
const QUIET_STARTS = [20, 21, 22, 23] as const;
const QUIET_ENDS = [5, 6, 7, 8, 9] as const;

/** "Notifications" section: an expiry-reminder row with a switch; tapping the row opens time settings. */
export function ReminderSettings() {
  const theme = useTheme();
  const settings = useReminderSettings();
  const [open, setOpen] = useState(false);
  const [timeFor, setTimeFor] = useState<Kind | null>(null);
  const [waterOpen, setWaterOpen] = useState(false);
  const [quietOpen, setQuietOpen] = useState(false);
  if (!notificationsSupported) {
    // Expo Go on Android and the web can't schedule phone reminders, so explain instead of hiding the section
    return (
      <>
        <SectionLabel>Notifications</SectionLabel>
        <ListCard>
          <ListRow
            icon="notifications-off-outline"
            label="Reminders need the installed app"
            subtitle={Platform.OS === 'web'
              ? 'Browsers can’t show MealMind reminders. Use the phone app.'
              : 'Expo Go can’t run reminders. Install a development build (npx expo run:android) to get water, meal and workout reminders.'}
            right={<View />}
          />
        </ListCard>
      </>
    );
  }
  if (!settings) return null;

   
  const toggle = async (key: 'enabled' | 'waterEnabled' | 'quietEnabled' | (typeof ACTIVITY)[Kind]['enabled'], on: boolean) => {
    if (on && !(await ensureNotificationPermission())) {
      return showAlert('Notifications blocked', 'Allow notifications for MealMind in your phone settings to get reminders.');
    }
    await saveReminderSettings({ ...settings, [key]: on } as ReminderPrefs);
  };
  const activityRow = (kind: Kind) => {
    const cfg = ACTIVITY[kind];
    const on = settings[cfg.enabled];
    return (
      <ListRow
        icon={cfg.icon}
        label={cfg.label}
        subtitle={on ? `${cfg.every} at ${formatHour(settings[cfg.hour])}` : 'Off'}
        onPress={on ? () => setTimeFor(kind) : undefined}
        right={<Switch value={on} onValueChange={(v) => toggle(cfg.enabled, v)} trackColor={{ true: theme.tint, false: theme.backgroundSelected }} thumbColor="#ffffff" />}
      />
    );
  };

  return (
    <>
      <SectionLabel>Notifications</SectionLabel>
      <ListCard>
        <ListRow
          icon="notifications-outline"
          label="Expiry reminders"
          subtitle={settings.enabled ? `Daily at ${formatHour(settings.hour)}` : 'Off'}
          onPress={settings.enabled ? () => setOpen(true) : undefined}
          right={
            <Switch
              value={settings.enabled}
              onValueChange={(v) => toggle('enabled', v)}
              trackColor={{ true: theme.tint, false: theme.backgroundSelected }}
              thumbColor="#ffffff"
                        />
          }
        />  
        {activityRow('meals')}
        {activityRow('workout')}
        {activityRow('weighIn')}
        <ListRow
          icon="water-outline"
          label="Water reminders"
          subtitle={settings.waterEnabled ? `Every ${settings.waterIntervalHours} h, ${formatHour(settings.waterStartHour)}–${formatHour(settings.waterEndHour)}` : 'Off'}
          onPress={settings.waterEnabled ? () => setWaterOpen(true) : undefined}
          right={<Switch value={settings.waterEnabled} onValueChange={(v) => toggle('waterEnabled', v)} trackColor={{ true: theme.tint, false: theme.backgroundSelected }} thumbColor="#ffffff" />}
        />
        <ListRow
          icon="moon-outline"
          label="Quiet hours"
          subtitle={settings.quietEnabled ? `No reminders ${formatHour(settings.quietStart)}–${formatHour(settings.quietEnd)}` : 'Off'}
          onPress={settings.quietEnabled ? () => setQuietOpen(true) : undefined}
          right={<Switch value={settings.quietEnabled} onValueChange={(v) => toggle('quietEnabled', v)} trackColor={{ true: theme.tint, false: theme.backgroundSelected }} thumbColor="#ffffff" />}
        />
      </ListCard>

      <BottomSheet
        visible={open}
        title="Expiry reminders"
        subtitle="A daily heads-up about food expiring today or tomorrow."
        onClose={() => setOpen(false)}>
        <ChipGroup
          options={HOURS}
          value={settings.hour as (typeof HOURS)[number]}
          onChange={(hour) => saveReminderSettings({ ...settings, hour })}
          format={formatHour}
        />
        <Pressable
          hitSlop={8}
          style={{ alignSelf: 'center' }}
          onPress={() =>
            sendTestReminder()
              .then(() => showAlert('Test scheduled', 'You should get a notification in about 5 seconds.'))
              .catch((e) => showAlert('Oops', e.message))
          }>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>Send a test notification</ThemedText>
               </Pressable>
        <Button title="Done" onPress={() => setOpen(false)} />
      </BottomSheet>

      <BottomSheet visible={!!timeFor} title={timeFor ? ACTIVITY[timeFor].label : ''} subtitle={timeFor ? ACTIVITY[timeFor].blurb : undefined} onClose={() => setTimeFor(null)}>
        {timeFor && (
          <ChipGroup
            options={ACTIVITY[timeFor].hours}
            value={settings[ACTIVITY[timeFor].hour]}
            onChange={(hour) => saveReminderSettings({ ...settings, [ACTIVITY[timeFor].hour]: hour } as ReminderPrefs)}
            format={formatHour}
          />
        )}
        <Button title="Done" onPress={() => setTimeFor(null)} />
      </BottomSheet>

      <BottomSheet
        visible={waterOpen}
        title="Water reminders"
        subtitle="Spread through your day. They stop once you reach today's water goal, and warn you if you fall behind."
        onClose={() => setWaterOpen(false)}>
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold">How often</ThemedText>
          <ChipGroup options={WATER_INTERVALS} value={settings.waterIntervalHours as (typeof WATER_INTERVALS)[number]} onChange={(waterIntervalHours) => saveReminderSettings({ ...settings, waterIntervalHours })} format={(h) => `Every ${h} hours`} />
          <ThemedText type="smallBold">First reminder</ThemedText>
          <ChipGroup options={WATER_STARTS} value={settings.waterStartHour as (typeof WATER_STARTS)[number]} onChange={(waterStartHour) => saveReminderSettings({ ...settings, waterStartHour })} format={formatHour} />
          <ThemedText type="smallBold">Last reminder</ThemedText>
          <ChipGroup options={WATER_ENDS} value={settings.waterEndHour as (typeof WATER_ENDS)[number]} onChange={(waterEndHour) => saveReminderSettings({ ...settings, waterEndHour })} format={formatHour} />
        </View>
        <Button title="Done" onPress={() => setWaterOpen(false)} />
      </BottomSheet>

      <BottomSheet visible={quietOpen} title="Quiet hours" subtitle="Meal, workout, water and weigh-in reminders stay silent in this time. Reminders you ask the coach for still come." onClose={() => setQuietOpen(false)}>
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="smallBold">From</ThemedText>
          <ChipGroup options={QUIET_STARTS} value={settings.quietStart as (typeof QUIET_STARTS)[number]} onChange={(quietStart) => saveReminderSettings({ ...settings, quietStart })} format={formatHour} />
          <ThemedText type="smallBold">Until</ThemedText>
          <ChipGroup options={QUIET_ENDS} value={settings.quietEnd as (typeof QUIET_ENDS)[number]} onChange={(quietEnd) => saveReminderSettings({ ...settings, quietEnd })} format={formatHour} />
        </View>
        <Button title="Done" onPress={() => setQuietOpen(false)} />
      </BottomSheet>
    </>
  );
}
