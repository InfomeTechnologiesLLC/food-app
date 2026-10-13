import { useState } from 'react';

import { BottomSheet } from '@/components/bottom-sheet';
import { ListCard, ListRow, SectionLabel } from '@/components/settings-list';
import { Button, ChipGroup, humanize } from '@/components/ui';
import { THEME_PREFERENCES, saveThemePreference, useThemePreference } from '@/lib/theme-preference';

/** "Appearance" section: a Theme row that opens a System / Light / Dark picker. Applies instantly. */
export function ThemeSettings() {
  const pref = useThemePreference();
  const [open, setOpen] = useState(false);
  if (!pref) return null;

  return (
    <>
      <SectionLabel>Appearance</SectionLabel>
      <ListCard>
        <ListRow icon="contrast-outline" label="Theme" value={humanize(pref)} onPress={() => setOpen(true)} />
      </ListCard>

      <BottomSheet
        visible={open}
        title="Theme"
        onClose={() => setOpen(false)}>
        <ChipGroup options={THEME_PREFERENCES} value={pref} onChange={saveThemePreference} format={humanize} fill />
        <Button title="Done" onPress={() => setOpen(false)} />
      </BottomSheet>
    </>
  );
}
