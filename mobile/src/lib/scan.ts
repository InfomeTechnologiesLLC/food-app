import { useMutation, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { api } from '@/lib/api';
import type { Category, PantryItem, ScanResult, ScanType } from '@/lib/types';

const MAX_SIDE = 1600;

export type PickSource = 'camera' | 'library';

/** Opens the camera or gallery. Returns null if the user cancels; throws if permission is denied. */
export async function pickPhoto(source: PickSource) {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(source === 'camera' ? 'Camera permission is needed to scan.' : 'Photo access is needed to pick an image.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : result.assets[0];
}

/** Downscales to MAX_SIDE and re-encodes as JPEG so uploads stay small (~200–400 KB). */
async function compress(asset: ImagePicker.ImagePickerAsset) {
  const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
  return result.uri;
}

export function useScanPhoto() {
  return useMutation({
    mutationFn: async ({ asset, type }: { asset: ImagePicker.ImagePickerAsset; type: ScanType }) => {
      const uri = await compress(asset);
      const form = new FormData();
      form.append('type', type);
      // Expo's fetch can't upload RN-style { uri, name, type } parts; it needs a real File/Blob
      form.append('image', new File(uri) as unknown as Blob, 'scan.jpg');
      return api<ScanResult>('/scans', { method: 'POST', body: form });
    },
  });
}

export interface ReviewItem {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  category: Category;
  expiryDays: number | null;
  lowConfidence: boolean;
}

export function useConfirmScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scanId, items }: { scanId: string; items: ReviewItem[] }) =>
      api<PantryItem[]>(`/scans/${scanId}/confirm`, {
        method: 'POST',
        body: {
          items: items.map((i) => ({
            name: i.name.trim(),
            quantity: Number(i.quantity.replace(',', '.')) || 1,
            unit: i.unit.trim() || 'pcs',
            category: i.category,
            expiryDate: i.expiryDays == null ? null : new Date(Date.now() + i.expiryDays * 86_400_000).toISOString(),
          })),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pantry'] });
      qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}
