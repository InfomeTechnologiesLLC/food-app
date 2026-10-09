import DateTimePicker from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipGroup, Input, Section, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDeletePantryItem, usePantry, useSavePantryItem } from '@/lib/pantry';
import { CATEGORIES, type Category } from '@/lib/types';

const QUICK_EXPIRY = [
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

export default function PantryItemScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: items = [] } = usePantry();
  const existing = id ? items.find((i) => i._id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 1));
  const [unit, setUnit] = useState(existing?.unit ?? 'pcs');
  const [category, setCategory] = useState<Category>(existing?.category ?? 'other');
  const [expiry, setExpiry] = useState<Date | null>(existing?.expiryDate ? new Date(existing.expiryDate) : null);
  const [showPicker, setShowPicker] = useState(false);

  const save = useSavePantryItem();
  const remove = useDeletePantryItem();

  const qty = Number(quantity.replace(',', '.'));
  const valid = name.trim().length > 0 && qty > 0;

  const onSave = () =>
    save.mutate(
      { id, data: { name: name.trim(), quantity: qty, unit: unit.trim() || 'pcs', category, expiryDate: expiry?.toISOString() ?? null } },
      { onSuccess: () => router.back() }
    );

  const onDelete = () =>
    showAlert('Delete item?', `Remove ${existing?.name} from your pantry.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(id!, { onSuccess: () => router.back() }) },
    ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: existing ? 'Edit item' : 'Add item' }} />

      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Tomatoes" autoFocus={!existing} />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <View style={{ flex: 1 }}>
          <Input label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Unit" value={unit} onChangeText={setUnit} placeholder="pcs, kg, L…" autoCapitalize="none" />
        </View>
      </View>

      <Section title="Category">
        <ChipGroup options={CATEGORIES} value={category} onChange={setCategory} format={humanize} />
      </Section>

      <Section title="Expiry date">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          <Chip label="None" selected={!expiry} onPress={() => setExpiry(null)} />
          {QUICK_EXPIRY.map((q) => (
            <Chip key={q.days} label={q.label} onPress={() => setExpiry(addDays(q.days))} />
          ))}
          <Chip label={expiry ? expiry.toLocaleDateString() : 'Pick date'} selected={!!expiry} onPress={() => setShowPicker(true)} />
        </View>
        {showPicker && (
          <DateTimePicker
            value={expiry ?? new Date()}
            mode="date"
            onChange={(event, date) => {
              setShowPicker(false);
              if (event.type === 'set' && date) setExpiry(date);
            }}
          />
        )}
      </Section>

      {save.error && <ThemedText themeColor="danger">{save.error.message}</ThemedText>}
      <Button title={existing ? 'Save changes' : 'Add to pantry'} onPress={onSave} loading={save.isPending} disabled={!valid} />
      {existing && <Button title="Delete" variant="danger" onPress={onDelete} loading={remove.isPending} />}
    </Screen>
  );
}
