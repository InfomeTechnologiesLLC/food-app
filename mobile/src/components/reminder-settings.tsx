import { useState } from 'react';
import { Pressable, Switch } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { ListCard, ListRow, SectionLabel } from '@/components/settings-list';
import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button, ChipGroup } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { notificationsSupported } from '@/lib/notifications';
import { ensureNotificationPermission, saveReminderSettings, sendTestReminder, useReminderSettings } from '@/lib/reminders';

const HOURS = [8, 9, 12, 18, 20] as const;
const formatHour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

/** "Notifications" section: an expiry-reminder row with a switch; tapping the row opens time settings. */
export function ReminderSettings() {
  const theme = useTheme();
  const settings = useReminderSettings();
  const [open, setOpen] = useState(false);
  if (!notificationsSupported || !settings) return null;

  const toggle = async (enabled: boolean) => {
    if (enabled && !(await ensureNotificationPermission())) {
      return showAlert('Notifications blocked', 'Allow notifications for MealMind in Android settings to get expiry reminders.');
    }
    await saveReminderSettings({ ...settings, enabled });
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
              onValueChange={toggle}
              trackColor={{ true: theme.tint, false: theme.backgroundSelected }}
              thumbColor="#ffffff"
            />
          }
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
    </>
  );
}
