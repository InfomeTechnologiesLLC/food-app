import DateTimePicker from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, ChipGroup, Input, Section, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDeletePantryBatch, usePantry, useSavePantryBatch } from '@/lib/pantry';
import { CATEGORIES, type Category, type PantryBatch } from '@/lib/types';

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

export default function PantryBatchScreen() {
  const params = useLocalSearchParams<{ ingredientId?: string; batchId?: string; name?: string; unit?: string; category?: Category }>();
  const { data: items = [], isLoading, error, refetch } = usePantry();
  const ingredient = items.find((item) => item._id === params.ingredientId);
  const batch = ingredient?.batches.find((item) => item._id === params.batchId);
  const existing = ingredient && batch ? { ...batch, name: ingredient.name, category: ingredient.category } : undefined;
  if (params.batchId && isLoading) return <Screen edges={['bottom']}><ActivityIndicator /></Screen>;
  if (params.batchId && (error || !existing)) return (
    <Screen edges={['bottom']}>
      <ThemedText themeColor="danger">{error ? 'Could not load this batch.' : 'This batch is no longer in your pantry.'}</ThemedText>
      {error && <Button title="Retry" onPress={() => refetch()} />}
    </Screen>
  );
  return <PantryBatchEditor key={params.batchId ?? 'new'} ingredientId={params.ingredientId} batchId={params.batchId} existing={existing} initialName={params.name} initialUnit={params.unit} initialCategory={params.category} />;
}

function PantryBatchEditor({ ingredientId, batchId, existing, initialName, initialUnit, initialCategory }: {
  ingredientId?: string; batchId?: string; existing?: PantryBatch & { name: string; category: Category }; initialName?: string; initialUnit?: string; initialCategory?: Category;
}) {

  const [name, setName] = useState(existing?.name ?? initialName ?? '');
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 1));
  const [unit, setUnit] = useState(existing?.unit ?? initialUnit ?? 'pcs');
  const [category, setCategory] = useState<Category>(existing?.category ?? initialCategory ?? 'other');
  const [expiry, setExpiry] = useState<Date | null>(existing?.expiryDate ? new Date(existing.expiryDate) : null);
  const [showPicker, setShowPicker] = useState(false);

  const save = useSavePantryBatch();
  const remove = useDeletePantryBatch();
  const request = useRef({ payload: '', id: '' });
  const submitting = useRef(false);

  const qty = Number(quantity.replace(',', '.'));
  const valid = name.trim().length > 0 && qty > 0;

  const onSave = () => {
    if (submitting.current) return;
    submitting.current = true;
    const data = { name: name.trim(), quantity: qty, unit: unit.trim() || 'pcs', category, expiryDate: expiry?.toISOString() ?? null };
    const payload = JSON.stringify(data);
    if (request.current.payload !== payload) request.current = { payload, id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
    save.mutate(
      { ingredientId, batchId, data, requestId: request.current.id },
      { onSuccess: () => router.back(), onSettled: () => { submitting.current = false; } }
    );
  };

  const onDelete = () =>
    showAlert('Delete item?', `Remove ${existing?.name} from your pantry.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate({ ingredientId: ingredientId!, batchId: batchId! }, { onSuccess: () => router.back() }) },
    ]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: existing ? 'Edit item' : 'Add item' }} />

      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Tomatoes" autoFocus={!existing} />
      <ThemedText type="small" themeColor="textSecondary">{existing ? 'Correct this batch’s quantity. This replaces its current amount.' : 'Enter the amount you are adding. It increases existing stock; expiry dates stay with each batch.'}</ThemedText>
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
