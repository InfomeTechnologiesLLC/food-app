import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { LogFoodSheet } from '@/components/log-food-sheet';
import { MealSuggestionCard } from '@/components/meal-suggestion-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadChat, saveChat, useCoachChat, useNextMeal } from '@/lib/coach-api';
import { dateLabel } from '@/lib/plans';
import { scheduleCoachReminder } from '@/lib/reminders';
import type { CoachAction, CoachMessage, FoodEstimate, MealType } from '@/lib/types';

const PROMPTS = ['How am I doing today?', 'I ate 2 parathas and a tea', 'Can I skip today’s workout?', 'Remind me to drink water at 4 pm'];
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const formatTime = (time: string) => { const [h, m] = time.split(':').map(Number); return `${h! % 12 || 12}:${String(m).padStart(2, '0')} ${h! < 12 ? 'AM' : 'PM'}`; };

/** Chat with the AI coach. Its answers use your real targets, meals, pantry, water and workouts. */
export default function CoachScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();
  const chat = useCoachChat();
  const nextMeal = useNextMeal();
  const scroll = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<CoachMessage[]>(() => (user ? loadChat(user._id) : []));
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState<{ estimate: FoodEstimate; mealType: MealType } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [reminderNotes, setReminderNotes] = useState<Record<string, string>>({});
  const busy = chat.isPending || nextMeal.isPending;

  useEffect(() => { if (user) saveChat(user._id, messages); }, [user, messages]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [messages.length, busy]);

  /** Side effects of coach actions: set phone reminders, refresh targets after a check-in. */
  const handleActions = async (messageId: string, actions: CoachAction[]) => {
    for (const [i, a] of actions.entries()) {
      if (a.type === 'reminder') {
        const ok = await scheduleCoachReminder(a.date, a.time, a.body).catch(() => false);
        setReminderNotes((n) => ({ ...n, [`${messageId}-${i}`]: ok ? `Reminder set for ${dateLabel(a.date)}, ${formatTime(a.time)}` : 'Couldn’t set the reminder. Allow notifications for MealMind, or it may be in the past.' }));
      }
      if (a.type === 'check_in') { void qc.invalidateQueries({ queryKey: ['targets'] }); void qc.invalidateQueries({ queryKey: ['target-changes'] }); }
    }
  };

  const send = (raw: string) => {
    const value = raw.trim();
    if (!value || busy) return;
    const history = [...messages, { id: newId(), role: 'user' as const, text: value }];
    setMessages(history);
    setText('');
    chat.mutate(history, {
      onSuccess: (res) => {
        const id = newId();
        setMessages((m) => [...m, { id, role: 'coach', text: res.reply, actions: res.actions }]);
        void handleActions(id, res.actions);
      },
      onError: (e) => setMessages((m) => [...m, { id: newId(), role: 'coach', text: e.message, error: true }]),
    });
  };

  const suggest = () => {
    if (busy) return;
    setMessages((m) => [...m, { id: newId(), role: 'user', text: 'What should I eat next?' }]);
    nextMeal.mutate(undefined, {
      onSuccess: (result) => setMessages((m) => [...m, { id: newId(), role: 'coach', text: result.status === 'suggested' ? 'Here is an idea that fits what you have left today.' : result.message, actions: result.status === 'suggested' ? [{ type: 'meal_suggestion', result }] : [] }]),
      onError: (e) => setMessages((m) => [...m, { id: newId(), role: 'coach', text: e.message, error: true }]),
    });
  };

  const limitReached = [chat.error, nextMeal.error].some((e) => e instanceof ApiError && e.code === 'LIMIT_REACHED');

  return (
    <ThemedView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.actions}>
            <View style={{ flex: 1 }}><Button title="Suggest a meal" icon="restaurant-outline" onPress={suggest} disabled={busy} /></View>
            <View style={{ flex: 1 }}><Button title="Log food" icon="add-circle-outline" variant="secondary" onPress={() => setLogOpen(true)} /></View>
          </View>

          {messages.length === 0 && (
            <View style={[styles.intro, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="chatbubbles-outline" size={28} color={theme.tint} />
              <ThemedText style={{ fontWeight: 700 }}>Hi! I’m your MealMind coach.</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Ask me what to eat, tell me what you ate, or ask about your workout. I use your real targets, meals, pantry, water and workouts.
              </ThemedText>
            </View>
          )}

          {messages.map((m) => (
            <View key={m.id} style={{ gap: Spacing.two, alignItems: m.role === 'user' ? 'flex-end' : 'stretch' }}>
              <View style={[styles.bubble, m.role === 'user'
                ? { backgroundColor: theme.tint, alignSelf: 'flex-end' }
                : { backgroundColor: theme.backgroundElement, alignSelf: 'flex-start' }]}>
                <ThemedText style={{ color: m.role === 'user' ? theme.tintText : m.error ? theme.danger : theme.text }}>{m.text}</ThemedText>
              </View>
              {m.actions?.map((a, i) => (
                <ActionView key={i} action={a} note={reminderNotes[`${m.id}-${i}`]} onConfirm={(estimate, mealType) => setConfirm({ estimate, mealType })} />
              ))}
            </View>
          ))}
          {busy && <ActivityIndicator color={theme.tint} style={{ alignSelf: 'flex-start' }} />}
          {limitReached && <Button title="See plans" variant="secondary" onPress={() => router.push('/upgrade')} />}

          {messages.length < 2 && (
            <View style={styles.chips}>
              {PROMPTS.map((p) => (
                <Pressable key={p} onPress={() => send(p)} style={[styles.chip, { borderColor: theme.border }]} accessibilityRole="button">
                  <ThemedText type="small">{p}</ThemedText>
                </Pressable>
              ))}
            </View>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, textAlign: 'center' }}>
            General guidance, not medical advice.{messages.length ? '  ' : ''}
            {messages.length > 0 && <ThemedText type="small" themeColor="tint" style={{ fontSize: 12 }} onPress={() => setMessages([])}>Clear chat</ThemedText>}
          </ThemedText>
        </ScrollView>

        <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            placeholder="Message your coach"
            placeholderTextColor={theme.textSecondary}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => send(text)}
            returnKeyType="send"
            maxLength={1000}
            accessibilityLabel="Message your coach"
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || busy} onPress={() => send(text)}
            style={[styles.send, { backgroundColor: theme.tint, opacity: !text.trim() || busy ? 0.5 : 1 }]}>
            <Ionicons name="arrow-up" size={20} color={theme.tintText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <LogFoodSheet visible={logOpen || !!confirm} initial={confirm ?? undefined} onClose={() => { setLogOpen(false); setConfirm(null); }} />
    </ThemedView>
  );
}

function ActionView({ action, note, onConfirm }: { action: CoachAction; note?: string; onConfirm: (e: FoodEstimate, t: MealType) => void }) {
  const theme = useTheme();
  if (action.type === 'meal_suggestion') return <MealSuggestionCard result={action.result} />;
  if (action.type === 'confirm_food') {
    const e = action.estimate;
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText style={{ fontWeight: 700 }}>{e.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">About {e.totals.calories} kcal · {e.totals.proteinGrams} g protein (estimate)</ThemedText>
        <Button title="Check and log it" icon="checkmark-outline" variant="secondary" onPress={() => onConfirm(e, action.mealType)} />
      </View>
    );
  }
  if (action.type === 'reminder') {
    return (
      <View style={styles.note}>
        <Ionicons name="alarm-outline" size={16} color={theme.tint} />
        <ThemedText type="small" themeColor="textSecondary">{note ?? 'Setting a reminder…'}</ThemedText>
      </View>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold">Weekly check-in{action.deltaKcal ? `: ${action.deltaKcal > 0 ? '+' : ''}${action.deltaKcal} kcal a day` : ''}</ThemedText>
      <ThemedText type="small">{action.reason}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', flexGrow: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  intro: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one, alignItems: 'flex-start' },
  bubble: { borderRadius: 16, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, maxWidth: '88%' },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: Spacing.three },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  input: { flex: 1, minHeight: 44, borderRadius: 22, paddingHorizontal: Spacing.three, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
