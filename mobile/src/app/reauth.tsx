import { useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';
export default function Reauthenticate() {
  const { user, signIn } = useAuth(); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); setError(''); try { await signIn(user!.email, password); router.back(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <Screen edges={['bottom']}><ThemedText type="subtitle">Sign in to sync</ThemedText><ThemedText>{user?.email}</ThemedText><ThemedText themeColor="textSecondary">Your saved workouts remain on this device.</ThemedText><Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />{!!error && <ThemedText themeColor="danger">{error}</ThemedText>}<Button title="Sign in" onPress={submit} loading={busy} /></Screen>;
}
