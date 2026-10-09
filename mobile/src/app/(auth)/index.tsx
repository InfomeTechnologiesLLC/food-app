import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (mode === 'register' && password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    setError(null);
    try {
      await (mode === 'login' ? signIn : signUp)(email.trim(), password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ gap: Spacing.four, paddingTop: Spacing.six }}>
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="subtitle" themeColor="tint">MealMind</ThemedText>
          <ThemedText themeColor="textSecondary">
            Snap your groceries or receipt. Get meal plans, shopping lists and expiry reminders.
          </ThemedText>
        </View>

        <View style={{ gap: Spacing.three }}>
          <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'password' : 'new-password'} />
          {error && <ThemedText themeColor="danger">{error}</ThemedText>}
          <Button title={mode === 'login' ? 'Log in' : 'Create account'} onPress={submit} loading={busy} disabled={!email || !password} />
        </View>

        <Pressable onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            {mode === 'login' ? "New here? Create an account" : 'Already have an account? Log in'}
          </ThemedText>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}
