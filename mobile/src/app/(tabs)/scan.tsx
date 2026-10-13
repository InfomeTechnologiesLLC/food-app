import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { showAlert } from '@/components/themed-alert';
import { ReviewRow } from '@/components/review-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pickPhoto, useConfirmScan, useScanPhoto, type PickSource, type ReviewItem } from '@/lib/scan';
import type { ScanType } from '@/lib/types';

const TYPES: ScanType[] = ['groceries', 'receipt'];
let keySeq = 0;

export default function ScanScreen() {
  const [type, setType] = useState<ScanType>('groceries');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);

  const theme = useTheme();
  const { refreshUser } = useAuth();
  const scan = useScanPhoto();
  const confirm = useConfirmScan();

  const reset = () => {
    setPhotoUri(null);
    setScanId(null);
    setItems([]);
    scan.reset();
    confirm.reset();
  };

  const start = async (source: PickSource) => {
    let asset;
    try {
      asset = await pickPhoto(source);
    } catch (e) {
      return showAlert('Permission needed', (e as Error).message);
    }
    if (!asset) return;
    reset();
    setPhotoUri(asset.uri);
    // Errors are rendered from scan.error below
    const result = await scan.mutateAsync({ asset, type }).catch(() => null);
    refreshUser();
    if (!result) return;
    setScanId(result.scanId);
    setItems(
      result.items.map((i) => ({
        key: String(keySeq++),
        name: i.name,
        quantity: String(i.quantity),
        unit: i.unit,
        category: i.category,
        expiryDays: i.estimatedExpiryDays,
        lowConfidence: i.confidence === 'low',
      }))
    );
  };

  const updateItem = (key: string, patch: Partial<ReviewItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const addItem = () =>
    setItems((list) => [
      ...list,
      { key: String(keySeq++), name: '', quantity: '1', unit: 'pcs', category: 'other', expiryDays: null, lowConfidence: false },
    ]);

  const validItems = items.filter((i) => i.name.trim());
  const invalidQuantities = validItems.some((item) => { const quantity = Number(item.quantity.replace(',', '.')); return !Number.isFinite(quantity) || quantity <= 0; });

  const save = () =>
    confirm.mutate(
      { scanId: scanId!, items: validItems },
      {
        onSuccess: (saved) => {
          reset();
          showAlert('Added to pantry', `${saved.length} item${saved.length === 1 ? '' : 's'} saved.`);
          router.navigate('/pantry');
        },
      }
    );

  // --- Review step -----------------------------------------------------------
  if (scanId) {
    return (
      <Screen edges={['bottom']}>
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="subtitle">Review items</ThemedText>
          <ThemedText themeColor="textSecondary">
            AI found {items.length} item{items.length === 1 ? '' : 's'}. Fix anything that’s wrong before saving.
          </ThemedText>
        </View>
        {photoUri && <Image source={{ uri: photoUri }} style={{ height: 160, borderRadius: 12 }} contentFit="cover" />}

        {items.map((item) => (
          <ReviewRow
            key={item.key}
            item={item}
            onChange={(patch) => updateItem(item.key, patch)}
            onRemove={() => setItems((list) => list.filter((i) => i.key !== item.key))}
          />
        ))}
        <Button title="+ Add missing item" variant="secondary" onPress={addItem} />

        {invalidQuantities && <ThemedText themeColor="danger">Each item needs a positive quantity.</ThemedText>}
        {confirm.error && <ThemedText themeColor="danger">{confirm.error.message}</ThemedText>}
        <Button
          title={`Save ${validItems.length} item${validItems.length === 1 ? '' : 's'} to pantry`}
          onPress={save}
          loading={confirm.isPending}
          disabled={validItems.length === 0 || invalidQuantities}
        />
        <Button title="Discard" variant="danger" onPress={reset} />
      </Screen>
    );
  }

  // --- Capture step ----------------------------------------------------------
  const limitReached = scan.error instanceof ApiError && scan.error.code === 'LIMIT_REACHED';

  return (
    <Screen edges={['bottom']}>
      <ThemedText themeColor="textSecondary">Capture what you have. We’ll handle the list.</ThemedText>

      <View style={[styles.segments, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {TYPES.map((t) => {
          const selected = t === type;
          const fg = selected ? theme.tintText : theme.textSecondary;
          return (
            <Pressable
              key={t}
              disabled={scan.isPending}
              onPress={() => setType(t)}
              style={[styles.segment, selected && { backgroundColor: theme.tint }]}>
              <Ionicons name={t === 'groceries' ? 'basket-outline' : 'receipt-outline'} size={18} color={fg} />
              <ThemedText style={{ color: fg, fontWeight: 600 }}>{t === 'groceries' ? 'Groceries' : 'Receipt'}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.viewfinder, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {scan.isPending && photoUri && (
          <Image source={{ uri: photoUri }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} contentFit="cover" />
        )}
        <Corners color={theme.tint} />

        {scan.isPending ? (
          <View style={{ alignItems: 'center', gap: Spacing.two }}>
            <ActivityIndicator size="large" color={theme.tint} />
            <ThemedText>{type === 'groceries' ? 'Identifying your groceries…' : 'Reading your receipt…'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">This usually takes 10–20 seconds.</ThemedText>
          </View>
        ) : (
          <>
            <Illustration type={type} color={theme.tint} />
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {type === 'groceries'
                ? 'Gather your groceries.\nKeep the labels facing you.'
                : 'Lay the receipt flat.\nCapture every item line.'}
            </ThemedText>
          </>
        )}
      </View>

      {scan.error && (
        <ThemedView type="backgroundElement" style={{ borderRadius: 12, padding: Spacing.three, gap: Spacing.one }}>
          <ThemedText themeColor="danger">{scan.error.message}</ThemedText>
          {limitReached ? (
            <Button title="See plans" variant="secondary" onPress={() => router.push('/upgrade')} />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">Failed scans don’t count toward your limit.</ThemedText>
          )}
        </ThemedView>
      )}

      <View style={{ gap: Spacing.two }}>
        <Button title="Take photo" icon="camera-outline" onPress={() => start('camera')} disabled={scan.isPending} />
        <Button title="Choose from gallery" icon="images-outline" variant="secondary" onPress={() => start('library')} disabled={scan.isPending} />
      </View>
    </Screen>
  );
}

/** Camera-style framing brackets in each corner of the viewfinder. */
function Corners({ color }: { color: string }) {
  const edge = { position: 'absolute', width: 28, height: 28, borderColor: color } as const;
  return (
    <>
      <View style={[edge, { top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 }]} />
      <View style={[edge, { top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 }]} />
      <View style={[edge, { bottom: 16, left: 16, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 }]} />
      <View style={[edge, { bottom: 16, right: 16, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 }]} />
    </>
  );
}

/** Line-icon cluster hinting at what to put in frame. */
function Illustration({ type, color }: { type: ScanType; color: string }) {
  const side = type === 'groceries' ? (['nutrition-outline', 'cafe-outline'] as const) : (['pricetag-outline', 'cash-outline'] as const);
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.row, { alignItems: 'flex-end', gap: Spacing.two }]}>
        <Ionicons name={side[0]} size={40} color={color} style={{ opacity: 0.8 }} />
        <View>
          <Ionicons name={type === 'groceries' ? 'bag-handle-outline' : 'receipt-outline'} size={96} color={color} />
          <Ionicons name="checkmark" size={28} color={color} style={styles.check} />
        </View>
        <Ionicons name={side[1]} size={40} color={color} style={{ opacity: 0.8 }} />
      </View>
      <View style={[styles.shadow, { backgroundColor: color }]} />
      <Ionicons name="add" size={16} color={color} style={[styles.sparkle, { top: 8, left: -24 }]} />
      <Ionicons name="add" size={16} color={color} style={[styles.sparkle, { top: 0, right: -24 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  segments: { flexDirection: 'row', padding: Spacing.one, borderRadius: 16, borderWidth: 1, gap: Spacing.one },
  segment: { flex: 1, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  viewfinder: {
    height: 300, borderRadius: 24, borderWidth: 1, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', gap: Spacing.four, padding: Spacing.five,
  },
  check: { position: 'absolute', alignSelf: 'center', top: 44 },
  shadow: { width: 180, height: 10, borderRadius: 999, opacity: 0.12, marginTop: Spacing.one },
  sparkle: { position: 'absolute', opacity: 0.6 },
});
