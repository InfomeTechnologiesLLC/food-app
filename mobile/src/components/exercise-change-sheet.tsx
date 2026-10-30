import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { showAlert } from '@/components/themed-alert';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { WorkoutPlan } from '@/lib/exercise-types';

export interface ExerciseToChange { plan: WorkoutPlan; date: string; index: number; name: string }
const IDEAS = ['Something easier', 'I prefer walking', 'No floor exercises', 'Something for my legs', 'I already did this'];

/** "No push-ups, I prefer walking": the coach swaps one exercise of a planned day. */
export function ExerciseChangeSheet({ target, onClose }: { target: ExerciseToChange | null; onClose: () => void }) {
  return (
    <BottomSheet visible={!!target} title="Change this exercise" subtitle={target ? `Replacing ${target.name}` : undefined} onClose={onClose}>
      {target && <ChangeForm key={`${target.date}:${target.index}`} target={target} onDone={onClose} />}
    </BottomSheet>
  );
}

function ChangeForm({ target, onDone }: { target: ExerciseToChange; onDone: () => void }) {
  const theme = useTheme();
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const [request, setRequest] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api<{ plan: WorkoutPlan; reason: string }>(`/exercise/plans/${target.plan._id}/change`, {
        method: 'POST', body: { date: target.date, index: target.index, request: request.trim(), remember, revision: target.plan.__v },
      });
      await qc.invalidateQueries({ queryKey: ['exercise', user?._id, 'plans'] });
      void refreshUser();
      onDone();
      showAlert('Exercise changed', res.reason);
    } catch (e) {
      showAlert('Couldn’t change this exercise', (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: Spacing.three }}>
      <Input label="What would you like instead?" placeholder="e.g. no push-ups, I prefer walking" value={request} onChangeText={setRequest} multiline maxLength={300} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {IDEAS.map((idea) => <Chip key={idea} label={idea} selected={request === idea} onPress={() => setRequest(idea)} />)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <ThemedText type="small" style={{ flex: 1 }}>Don’t suggest {target.name} again</ThemedText>
        <Switch value={remember} onValueChange={setRemember} trackColor={{ true: theme.tint, false: theme.backgroundSelected }} thumbColor="#ffffff" />
      </View>
      <Button title="Change exercise" icon="swap-horizontal" onPress={() => void submit()} loading={busy} disabled={request.trim().length < 2} />
      {busy && <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Finding a better fit, about 10 seconds…</ThemedText>}
    </View>
  );
}
