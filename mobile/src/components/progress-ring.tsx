import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/**
 * Circular progress drawn with plain Views (no SVG dependency): each half of the ring is a clipped
 * half-arc that rotates into view, the right half filling first, then the left.
 */
export function ProgressRing({
  progress, label, color, size = 52, stroke = 5,
}: {
  /** 0..1 */
  progress: number;
  label: string;
  color: string;
  size?: number;
  stroke?: number;
}) {
  const theme = useTheme();
  const p = Math.max(0, Math.min(1, progress));
  const rightDeg = Math.min(p, 0.5) * 360;
  const leftDeg = Math.max(0, p - 0.5) * 360;
  const half = size / 2;
  // A circle with only its top + right borders coloured is a 180° arc; rotated 45° it covers the right half.
  const arc = {
    width: size, height: size, borderRadius: half, borderWidth: stroke,
    borderColor: 'transparent', borderTopColor: color, borderRightColor: color,
  } as const;

  return (
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: half, borderWidth: stroke, borderColor: theme.backgroundSelected }]} />
      {p > 0 && (
        <>
          <View style={[styles.clip, { left: half, width: half, height: size }]}>
            <View style={[arc, { position: 'absolute', left: -half, transform: [{ rotate: `${-135 + rightDeg}deg` }] }]} />
          </View>
          {leftDeg > 0 && (
            <View style={[styles.clip, { left: 0, width: half, height: size }]}>
              <View style={[arc, { position: 'absolute', left: 0, transform: [{ rotate: `${45 + leftDeg}deg` }] }]} />
            </View>
          )}
        </>
      )}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <ThemedText style={{ fontWeight: 700 }}>{label}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
