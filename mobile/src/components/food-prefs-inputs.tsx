import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/** Countries whose home cooking meal plans can follow. Anything else can be typed. */
export const CUISINES = [
  'India', 'Sri Lanka', 'Bangladesh', 'Pakistan', 'Nepal', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Malaysia', 'Singapore',
  'Indonesia', 'Thailand', 'Philippines', 'China', 'Japan', 'South Korea', 'United Kingdom', 'United States', 'Canada', 'Australia',
  'Italy', 'Mexico',
];

/** Pick a country, or type another one. Tap the selected country again to clear it. */
export function CuisinePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const custom = value && !CUISINES.includes(value) ? value : '';
  const [other, setOther] = useState(custom);
  return (
    <View style={{ gap: Spacing.two }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {CUISINES.map((c) => <Chip key={c} label={c} selected={value === c} onPress={() => onChange(value === c ? null : c)} />)}
      </View>
      <Input
        placeholder="Another country"
        value={other}
        onChangeText={(t) => { setOther(t); onChange(t.trim().length >= 2 ? t.trim() : null); }}
        maxLength={60}
      />
    </View>
  );
}

/** Foods the user doesn't like, as removable chips plus a box to add more. */
export function DislikesInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const items = text.split(',').map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0 && t.length <= 40);
    if (items.length) onChange([...new Set([...value, ...items])].slice(0, 30));
    setText('');
  };
  return (
    <View style={{ gap: Spacing.two }}>
      {value.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {value.map((d) => <Chip key={d} label={`${d}  ✕`} selected onPress={() => onChange(value.filter((x) => x !== d))} />)}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">Nothing yet. Meals will avoid anything you add here.</ThemedText>
      )}
      <Input placeholder="e.g. potato, brinjal" value={text} onChangeText={setText} onSubmitEditing={add} onBlur={add} returnKeyType="done" maxLength={80} />
    </View>
  );
}
