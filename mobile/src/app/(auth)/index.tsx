import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !email.trim() || !password) return;
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
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AppHeader colorScheme="dark" />

          <Text accessibilityRole="header" style={styles.heading}>
            {mode === 'login' ? 'Log in.' : 'Sign up.'}
          </Text>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text nativeID="email-label" style={styles.label}>Email address</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color={palette.muted} />
                <TextInput
                  accessibilityLabel="Email address"
                  accessibilityLabelledBy="email-label"
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={palette.muted}
                  selectionColor={palette.green}
                  keyboardAppearance="dark"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!busy}
                />
              </View>
            </View>
            <View style={styles.field}>
              <Text nativeID="password-label" style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={palette.muted} />
                <TextInput
                  accessibilityLabel="Password"
                  accessibilityLabelledBy="password-label"
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={palette.muted}
                  selectionColor={palette.green}
                  keyboardAppearance="dark"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={mode === 'login' ? 'password' : 'new-password'}
                  editable={!busy}
                  returnKeyType="go"
                  onSubmitEditing={submit}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.visibilityButton}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={palette.muted} />
                </Pressable>
              </View>
            </View>
            {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !email.trim() || !password || busy, busy }}
              disabled={!email.trim() || !password || busy}
              onPress={submit}
              style={({ pressed }) => [styles.submit, { opacity: pressed || busy ? 0.8 : 1 }]}>
              {busy ? <ActivityIndicator color="#03140A" /> : (
                <>
                  <Text style={styles.submitText}>{mode === 'login' ? 'Log in' : 'Create account'}</Text>
                  <Ionicons name="arrow-forward" size={19} color="#03140A" />
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{mode === 'login' ? 'New here?' : 'Already have an account?'}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              hitSlop={8}
              onPress={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setShowPassword(false);
                setError(null);
              }}>
              <Text style={styles.footerLink}>{mode === 'login' ? 'Create an account' : 'Log in'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const palette = { green: '#2FC367', muted: '#A5A8AD' };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  keyboardView: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 },
  heading: { fontFamily: Fonts.rounded, color: '#FFFFFF', fontSize: 52, fontWeight: '400', letterSpacing: -2.5, lineHeight: 64, marginTop: 92, marginBottom: 38 },
  form: { gap: 16 },
  field: { gap: 8 },
  label: { fontFamily: Fonts.sans, color: '#C2C5CB', fontSize: 12, lineHeight: 16 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingLeft: 16, paddingRight: 4, borderRadius: 14, borderWidth: 1, borderColor: '#343539', backgroundColor: '#262729', gap: 12 },
  input: { flex: 1, minWidth: 0, fontFamily: Fonts.sans, color: '#FFFFFF', fontSize: 14, paddingVertical: 16, paddingRight: 12 },
  visibilityButton: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#FF6B5E', fontSize: 13, lineHeight: 20 },
  submit: { marginTop: 8, minHeight: 52, borderRadius: 14, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12 },
  submitText: { fontFamily: Fonts.sans, color: '#03140A', fontSize: 15, fontWeight: '500' },
  footer: { marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText: { fontFamily: Fonts.sans, color: palette.muted, fontSize: 12, lineHeight: 20 },
  footerLink: { fontFamily: Fonts.sans, color: palette.green, fontSize: 13, lineHeight: 20, fontWeight: '500' },
});
